#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <WiFiClientSecure.h>

// ====== Wi-Fi Credentials ======
const char* ssid = "iPhone";
const char* password = "DXBTURFD";

// ====== ThingSpeak API Keys and Channels ======
// Replace these with your actual API keys and channel IDs
// THESE HAVE TO BE WRITE KEYS
const char* apiKeys[6] = {
  "MH9PG5BKVZIYGW18", // Channel 1 API Key
  "FXNT93E2CGJZOXYZ",        // Channel 2 API Key
  "241WNVOWZCVDUNL0",        // Channel 3 API Key
  "B2NKKTZBEG91U9PX",        // Channel 4 API Key
  "EMAQGRWKUB4SOUCN",        // Channel 5 API Key
  "8EAR1YJRSYWMGHBO"         // Channel 6 API Key
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
// IR Sensor pins
const int IR_SENSOR_PINS[6] = {15, 16, 17, 18, 19, 21};

// Servo pins
const int SERVO_PINS[6] = {13, 14, 25, 26, 27, 32};

// Ultrasonic sensor pins for Road 1
const int TRIG_PIN_ROAD1 = 22;
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

// Servo configuration
#define SERVOMIN  125 // This is the 'minimum' pulse length count (out of 4096)
#define SERVOMAX  575 // This is the 'maximum' pulse length count (out of 4096)
#define SERVO_FREQ 50 // Analog servos run at ~50 Hz updates

// Servo positions
const int SERVO_CENTER = 90;      // Rest position
const int SERVO_LEFT = 45;        // First spot position (90-45)
const int SERVO_RIGHT = 135;      // Second spot position (90+45)

// Servo to spot mapping
// Servo 0 (Channel 0) -> Row 1, Spots A & B
// Servo 1 (Channel 1) -> Row 1, Spots C & D
// Servo 2 (Channel 2) -> Row 2, Spots A & B
// Servo 3 (Channel 3) -> Row 2, Spots C & D
// Servo 4 (Channel 4) -> Row 3, Spots A & B
// Servo 5 (Channel 5) -> Row 3, Spots C & D

// Function to convert angle to pulse length
int angleToPulse(int angle) {
  int pulse = map(angle, 0, 180, SERVOMIN, SERVOMAX);
  return pulse;
}

// Reading variables
volatile int spotReadings[6][2] = {{0}}; // [sensor][spot]
volatile bool spotOccupied[6][2] = {{false}}; // Track occupation status
SemaphoreHandle_t readingMutex;  // For safe access to readings across tasks

// Task handles for parallel operations
TaskHandle_t irReadingTasks[6];
TaskHandle_t thingSpeakTasks[6];
TaskHandle_t speedMonitorTask;

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

// ====== Setup ======
void setup() {
  Serial.begin(115200);
  
  // Initialize I2C and servo driver
  Wire.begin();
  pwm.begin();
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(SERVO_FREQ);
  
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
    pwm.setPWM(i, 0, angleToPulse(SERVO_CENTER));
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
    "SpeedMonitorTask",  // Name
    4000,                // Stack size
    NULL,                // Parameter
    1,                   // Priority
    &speedMonitorTask,   // Task handle
    0                    // Core (0)
  );
  
  Serial.println("System initialized. Starting parking monitoring...");
}

// ====== Main Loop ======
void loop() {
  // All servos at center position (90°) for 10 seconds
  Serial.println("=== ALL SERVOS AT CENTER POSITION (90°) ===");
  for (int i = 0; i < 6; i++) {
    pwm.setPWM(i, 0, angleToPulse(SERVO_CENTER));
  }
  delay(10000); // 10 seconds at center
  
  // All servos at Spot 1 position (135°) for 4 seconds
  Serial.println("=== ALL SERVOS AT POSITION 135° - SCANNING FIRST SPOTS ===");
  for (int i = 0; i < 6; i++) {
    pwm.setPWM(i, 0, angleToPulse(SERVO_RIGHT));
  }
  delay(100); // Short delay for servos to start moving
  
  // Start all IR sensor reading tasks simultaneously for first spots
  for (int i = 0; i < 6; i++) {
    xTaskNotifyGive(irReadingTasks[i]);
  }
  
  // Wait for 4 seconds for readings
  delay(4000);
  
  // All servos at Spot 2 position (45°) for 4 seconds
  Serial.println("=== ALL SERVOS AT POSITION 45° - SCANNING SECOND SPOTS ===");
  for (int i = 0; i < 6; i++) {
    pwm.setPWM(i, 0, angleToPulse(SERVO_LEFT));
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
    pwm.setPWM(i, 0, angleToPulse(SERVO_CENTER));
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
