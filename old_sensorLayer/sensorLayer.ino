#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <WiFiClientSecure.h>

// ====== Wi-Fi Credentials ======
const char* ssid = "WIFI_SSID";
const char* password = "WIFI_PASSWORD";

// ====== ThingSpeak API Keys and Channels ======
// Replace these with your actual API keys and channel IDs
// THESE HAVE TO BE WRITE KEYS
const char* apiKeys[6] = {
  "API_KEY_1", // Channel 1 API Key
  "API_KEY_2", // Channel 2 API Key
  "API_KEY_3", // Channel 3 API Key
  "API_KEY_4", // Channel 4 API Key
  "API_KEY_5", // Channel 5 API Key
  "API_KEY_6"  // Channel 6 API Key
};

const int channelIDs[6] = {
  2914193,  // Channel 1 ID
  2914195,        // Channel 2 ID - Replace with actual channel ID
  2914196,        // Channel 3 ID - Replace with actual channel ID
  2914197,        // Channel 4 ID - Replace with actual channel ID
  2914203,        // Channel 5 ID - Replace with actual channel ID
  2914204         // Channel 6 ID - Replace with actual channel ID
};

// ====== Pin Definitions ======
// I2C Pins
const int I2C_SDA = 21;
const int I2C_SCL = 22;

// IR Sensor pins
const int IR_SENSOR_PINS[6] = {15, 16, 17, 18, 19, 21};

// Servo channel mapping on PCA9685 (channels 0-5)
const uint8_t servoChannels[6] = {0, 1, 2, 3, 4, 5};

// Ultrasonic sensor pins for Road 1 (moved from GPIO22 to GPIO13)
const int TRIG_PIN_ROAD1 = 13;
const int ECHO_PIN_ROAD1 = 23;
const int LED_PIN_ROAD1 = 2;

// Ultrasonic sensor pins for Road 2
const int TRIG_PIN_ROAD2 = 4;
const int ECHO_PIN_ROAD2 = 5;
const int LED_PIN_ROAD2 = 3;

// Speed detection constants
const float SENSOR_DISTANCE = 100.0;  // Distance between sensors in cm
const float SPEED_LIMIT = 4.0;    // Speed limit in cm/s
const int LED_FLASH_DURATION = 2000;  // LED flash duration in milliseconds
const int BLINK_COUNT = 3;        // Number of times to blink LED
const int BLINK_DELAY = 200;      // Delay between blinks in ms

// Add these constants at the top with other constants
const int SERVO_MOVE_TIME = 500;     // Time to allow servo to reach position
const int IR_SAMPLES = 20;           // Number of samples to average
const int IR_SAMPLE_DELAY = 50;      // Delay between samples

// Create servo driver object
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Servo configuration for SG90 with PCA9685
#define SERVOMIN  100  // Minimum pulse length count (0 degrees) - updated from 100
#define SERVOMAX  530  // Maximum pulse length count (180 degrees) - updated from 530
#define SERVO_FREQ 50  // Standard 50Hz servo frequency

// Servo positions (in degrees)
const int SERVO_CENTER = 90;      // Rest position
const int SERVO_LEFT = 0;        // First spot position (90-45)
const int SERVO_RIGHT = 180;      // Second spot position (90+45)

// Function to convert angle to pulse length for SG90
int angleToPulse(int angle) {
  // Ensure angle is within bounds
  angle = constrain(angle, 0, 180);
  // Map angle to pulse length
  return map(angle, 0, 180, SERVOMIN, SERVOMAX);
}

// Reading variables
volatile int spotReadings[6][2] = {{0}}; // [sensor][spot]
volatile bool spotOccupied[6][2] = {{false}}; // Track occupation status
SemaphoreHandle_t readingMutex;  // For safe access to readings across tasks

// Task handles for parallel operations
TaskHandle_t irReadingTasks[6];
TaskHandle_t thingSpeakTasks[6];
TaskHandle_t speedMonitorTaskHandle;  // Changed from speedMonitorTask

// ====== WiFi Setup ======
void connectToWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi connected!");
}

// ====== Parallel IR Reading Task ======
void irReadingTask(void* parameter) {
  int sensorIndex = (int)parameter;
  int sensorPin = IR_SENSOR_PINS[sensorIndex];
  
  while (true) {
    // Wait for notification to start reading
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    
    // Allow servo to reach position
    delay(SERVO_MOVE_TIME);
    
    // For Spot 1 (servo at 0°)
    int detectionCount = 0;
    
    // Take multiple samples
    for(int i = 0; i < IR_SAMPLES; i++) {
      if (digitalRead(sensorPin) == LOW) {  // Object detected
        detectionCount++;
      }
      delay(IR_SAMPLE_DELAY);
    }
    
    // Calculate occupation based on threshold
    bool isOccupied = (detectionCount > (IR_SAMPLES * 0.7)); // 70% threshold
    
    // Update the reading securely
    xSemaphoreTake(readingMutex, portMAX_DELAY);
    spotOccupied[sensorIndex][0] = isOccupied;
    spotReadings[sensorIndex][0] = isOccupied ? 1 : 0;
    xSemaphoreGive(readingMutex);
    
    // Wait for next notification (for Spot 2)
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    
    // Allow servo to reach position
    delay(SERVO_MOVE_TIME);
    
    // For Spot 2 (servo at 180°)
    detectionCount = 0;
    
    // Take multiple samples
    for(int i = 0; i < IR_SAMPLES; i++) {
      if (digitalRead(sensorPin) == LOW) {  // Object detected
        detectionCount++;
      }
      delay(IR_SAMPLE_DELAY);
    }
    
    // Calculate occupation based on threshold
    isOccupied = (detectionCount > (IR_SAMPLES * 0.7)); // 70% threshold
    
    // Update the reading securely
    xSemaphoreTake(readingMutex, portMAX_DELAY);
    spotOccupied[sensorIndex][1] = isOccupied;
    spotReadings[sensorIndex][1] = isOccupied ? 1 : 0;
    xSemaphoreGive(readingMutex);
  }
}

// ====== ThingSpeak Send Task ======
void thingSpeakTask(void* parameter) {
  int channelIndex = (int)parameter;
  
  while (true) {
    // Wait for notification to start sending
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    
    // Get the current readings
    int spot1, spot2;
    xSemaphoreTake(readingMutex, portMAX_DELAY);
    spot1 = spotReadings[channelIndex][0];
    spot2 = spotReadings[channelIndex][1];
    xSemaphoreGive(readingMutex);
    
    // Send to ThingSpeak (all channels send simultaneously)
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      String url = "http://api.thingspeak.com/update?api_key=" + String(apiKeys[channelIndex]);
      url += "&field1=" + String(spot1);
      url += "&field2=" + String(spot2);

      http.begin(url);
      int response = http.GET();
      http.end();

      Serial.print("ThingSpeak Channel ");
      Serial.print(channelIndex + 1);
      Serial.print(" Response Code: ");
      Serial.println(response);
    } else {
      Serial.println("Wi-Fi Disconnected! Can't send data.");
    }
  }
}

// ====== Speed Monitoring Functions ======
void monitorRoadSpeed(int trigPin, int echoPin, int ledPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  
  long duration = pulseIn(echoPin, HIGH);
  float distance = duration * 0.034 / 2;
  
  if (distance < 400) {  // Object detected
    unsigned long startTime = millis();
    float prevDistance = distance;
    
    // Monitor for movement over a short period
    delay(100);  // Wait a bit before second measurement
    
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);
    
    duration = pulseIn(echoPin, HIGH);
    float newDistance = duration * 0.034 / 2;
    
    // Calculate speed (cm/s)
    float timeDiff = (millis() - startTime) / 1000.0;  // Convert to seconds
    float speed = abs(newDistance - prevDistance) / timeDiff;
    
    if (speed > SPEED_LIMIT) {
      // Flash LED for 2 seconds
      digitalWrite(ledPin, HIGH);
      delay(LED_FLASH_DURATION);
      digitalWrite(ledPin, LOW);
      
      Serial.print("Speed violation detected on road: ");
      Serial.print(speed);
      Serial.println(" cm/s");
    }
  }
}

void speedMonitorTask(void* parameter) {
  while (true) {
    // Monitor Road 1
    monitorRoadSpeed(TRIG_PIN_ROAD1, ECHO_PIN_ROAD1, LED_PIN_ROAD1);
    
    // Monitor Road 2
    monitorRoadSpeed(TRIG_PIN_ROAD2, ECHO_PIN_ROAD2, LED_PIN_ROAD2);
    
    delay(100);  // Small delay between readings
  }
}

// ====== I2C Scanning ======
void scanI2C() {
  byte error, address;
  int nDevices = 0;
  
  Serial.println("Scanning for I2C devices...");
  
  for(address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();
    
    if (error == 0) {
      Serial.print("I2C device found at address 0x");
      if (address < 16) {
        Serial.print("0");
      }
      Serial.println(address, HEX);
      nDevices++;
    }
  }
  
  if (nDevices == 0) {
    Serial.println("No I2C devices found!");
  }
}

// ====== Setup ======
void setup() {
  Serial.begin(115200);
  Serial.println();  // Print empty line to clear any garbage
  Serial.flush();    // Flush the buffer
  delay(1000);       // Give Serial time to stabilize
  
  Serial.println("\r\n=== Starting Smart Parking System ===\r\n");
  
  // Initialize I2C and servo driver with explicit pins
  Wire.begin(I2C_SDA, I2C_SCL);
  delay(1000); // Give I2C time to initialize
  
  // Scan for I2C devices
  scanI2C();
  
  Serial.println("Initializing servo driver...");
  if (!pwm.begin()) {
    Serial.println("PCA9685 not found! Check wiring...");
    while (1);
  }
  Serial.println("PCA9685 found successfully!");
  
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(SERVO_FREQ);
  Serial.println("PWM frequency set to 50Hz");
  
  // Initialize IR sensor pins
  for (int i = 0; i < 6; i++) {
    pinMode(IR_SENSOR_PINS[i], INPUT);
  }
  
  // Initialize ultrasonic sensor pins
  pinMode(TRIG_PIN_ROAD1, OUTPUT);
  pinMode(ECHO_PIN_ROAD1, INPUT);
  pinMode(TRIG_PIN_ROAD2, OUTPUT);
  pinMode(ECHO_PIN_ROAD2, INPUT);
  pinMode(LED_PIN_ROAD1, OUTPUT);
  pinMode(LED_PIN_ROAD2, OUTPUT);
  digitalWrite(LED_PIN_ROAD1, LOW);
  digitalWrite(LED_PIN_ROAD2, LOW);

  // Initialize all servos to center position
  for (int i = 0; i < 6; i++) {
    pwm.setPWM(servoChannels[i], 0, angleToPulse(SERVO_CENTER));
    delay(200); // Small delay between initializing servos
  }
  
  delay(1000); // Allow servos to reach position
  
  // Create mutex for safe access to readings
  readingMutex = xSemaphoreCreateMutex();
  
  // Create tasks for parallel IR reading and ThingSpeak uploads
  for (int i = 0; i < 6; i++) {
    xTaskCreatePinnedToCore(
      irReadingTask,    // Task function
      "IRReadingTask",  // Name
      4000,             // Stack size
      (void*)i,         // Parameter (sensor index)
      1,                // Priority
      &irReadingTasks[i], // Task handle
      0                 // Core (0)
    );
    
    xTaskCreatePinnedToCore(
      thingSpeakTask,    // Task function
      "ThingSpeakTask",  // Name
      4000,              // Stack size
      (void*)i,          // Parameter (channel index)
      1,                 // Priority
      &thingSpeakTasks[i], // Task handle
      1                  // Core (1)
    );
  }
  
  connectToWiFi();
  
  // Create speed monitor task
  xTaskCreatePinnedToCore(
    speedMonitorTask,     // Task function
    "SpeedMonitorTask",   // Name
    4000,                 // Stack size
    NULL,                 // Parameter
    1,                    // Priority
    &speedMonitorTaskHandle,   // Changed from &speedMonitorTask
    0                     // Core (0)
  );
  
  Serial.println("System initialized. Starting parking monitoring...");
}

// ====== Main Loop ======
void loop() {
  // All servos at center position (90°) for 10 seconds
  Serial.println("=== ALL SERVOS AT CENTER POSITION (90°) ===");
  for (int i = 0; i < 6; i++) {
    pwm.setPWM(servoChannels[i], 75, angleToPulse(SERVO_CENTER));
  }
  delay(10000); // 10 seconds at center
  
  // All servos at Spot 1 position (135°) for 4 seconds
  Serial.println("=== ALL SERVOS AT POSITION 0° - SCANNING FIRST SPOTS ===");
  for (int i = 0; i < 6; i++) {
    pwm.setPWM(servoChannels[i],0 , angleToPulse(SERVO_RIGHT));
  }
  delay(100); // Short delay for servos to start moving
  
  // Start all IR sensor reading tasks simultaneously for first spots
  for (int i = 0; i < 6; i++) {
    xTaskNotifyGive(irReadingTasks[i]);
  }
  
  // Wait for 4 seconds for readings
  delay(4000);
  
  // All servos at Spot 2 position (45°) for 4 seconds
  Serial.println("=== ALL SERVOS AT POSITION 180° - SCANNING SECOND SPOTS ===");
  for (int i = 0; i < 6; i++) {
    pwm.setPWM(servoChannels[i], 150, angleToPulse(SERVO_LEFT));
  }
  delay(100); // Short delay for servos to start moving
  
  // Start all IR sensor reading tasks simultaneously for second spots
  for (int i = 0; i < 6; i++) {
    xTaskNotifyGive(irReadingTasks[i]);
  }
  
  // Wait for 4 seconds for readings
  delay(4000);
  
  // Return all servos to center position
  for (int i = 0; i < 6; i++) {
    pwm.setPWM(servoChannels[i], 0, angleToPulse(SERVO_CENTER));
  }
  
  // Notify all ThingSpeak tasks to upload data simultaneously
  for (int i = 0; i < 6; i++) {
    xTaskNotifyGive(thingSpeakTasks[i]);
  }
  
  // Report to Serial for all sensors
  Serial.println("====================================");
  Serial.println("PARKING STATUS REPORT - ALL SENSORS");
  Serial.println("====================================");
  
  xSemaphoreTake(readingMutex, portMAX_DELAY);
  for (int i = 0; i < 6; i++) {
    Serial.print("Row ");
    Serial.print((i / 2) + 1);
    Serial.print(", ");
    Serial.print(i % 2 == 0 ? "Spots A/B" : "Spots C/D");
    Serial.println(":");
    Serial.print("  Spot at 135°: ");
    Serial.println(spotReadings[i][0] == 1 ? "OCCUPIED" : "EMPTY");
    Serial.print("  Spot at 45°: ");
    Serial.println(spotReadings[i][1] == 1 ? "OCCUPIED" : "EMPTY");
  }
  xSemaphoreGive(readingMutex);
  
  Serial.println("Completed full cycle for all sensors");
  delay(1000); // Short delay before next cycle
}
