#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ====== Wi-Fi Credentials ======
const char* ssid = "iPhone";
const char* password = "DXBTURFD";

// ====== ThingSpeak Configuration ======
// Channel mapping:
// Channel 1 (IR on Servo 1) -> A1, A2
// Channel 2 (IR on Servo 2) -> A3, A4
// Channel 3 (IR on Servo 3) -> B1, B2
// Channel 4 (IR on Servo 4) -> B3, B4
// Channel 5 (IR on Servo 5) -> C1, C2
// Channel 6 (IR on Servo 6) -> C3, C4
const char* apiKeys[6] = {
  "MH9PG5BKVZIYGW18", // Channel 1 - Servo 1 IR (A1,A2)
  "FXNT93E2CGJZOXYZ", // Channel 2 - Servo 2 IR (A3,A4)
  "241WNVOWZCVDUNL0", // Channel 3 - Servo 3 IR (B1,B2)
  "B2NKKTZBEG91U9PX", // Channel 4 - Servo 4 IR (B3,B4)
  "EMAQGRWKUB4SOUCN", // Channel 5 - Servo 5 IR (C1,C2)
  "8EAR1YJRSYWMGHBO"  // Channel 6 - Servo 6 IR (C3,C4)
};

// PCA9685 driver (default I²C address 0x40)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Number of servos and their PCA9685 channels (0–15)
const uint8_t NUM_SERVOS = 6;
const uint8_t servoChannels[NUM_SERVOS] = { 0, 1, 2, 3, 4, 5 };

// IR sensor pins for each servo (one IR per servo)
const int IR_PINS[NUM_SERVOS] = {15, 13, 17, 18, 19, 27};  // GPIO pins for IR sensors

// Sampling parameters for reliable readings
const int SAMPLES_PER_SPOT = 40;  // Number of samples to take during 4s window
const int SAMPLE_DELAY = 100;     // Delay between samples (100ms * 40 = 4s total)
const float OCCUPANCY_THRESHOLD = 0.7;  // 70% threshold for determining occupancy

// Arrays to store all spot readings (12 total spots: A1-A4, B1-B4, C1-C4)
bool allSpots[12] = {false}; // Even indices = 0° spots, Odd indices = 150° spots

// Pulse limits for SG90 servos (correct working values)
const uint16_t SERVOMIN = 100;   // Working value for 0 degrees
const uint16_t SERVOMAX = 530;   // Working value for 180 degrees

// I2C pins
const int I2C_SDA = 21;
const int I2C_SCL = 22;

// Move one servo on `channel` to `angle` (0–180°)
void setServoAngle(uint8_t channel, float angle) {
  angle = constrain(angle, 0, 180);
  uint16_t pulse = map(angle, 0, 180, SERVOMIN, SERVOMAX);
  pwm.setPWM(channel, 0, pulse);
  Serial.print("Moving servo ");
  Serial.print(channel);
  Serial.print(" to angle ");
  Serial.print(angle);
  Serial.print("° (pulse: ");
  Serial.print(pulse);
  Serial.println(")");
}

void scanI2C() {
  byte error, address;
  int nDevices = 0;
  Serial.println("Scanning for I2C devices...");
  for(address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C device found at address 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      nDevices++;
    }
  }
  if (nDevices == 0) Serial.println("No I2C devices found!");
}

// Function to send all data to ThingSpeak simultaneously
void sendAllToThingSpeak() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http[6]; // One for each channel
    String responses[6];
    
    Serial.println("\n=== Sending Data to ThingSpeak ===");
    for(int i = 0; i < 6; i++) {
      String url = "http://api.thingspeak.com/update?api_key=" + String(apiKeys[i]);
      // Each IR has 2 spots: spots[i*2] for 0° and spots[i*2+1] for 150°
      url += "&field1=" + String(allSpots[i*2] ? 1 : 0);   // First spot at 0°
      url += "&field2=" + String(allSpots[i*2+1] ? 1 : 0); // Second spot at 150°
      
      http[i].begin(url);
      
      // Send request and get response
      int httpResponseCode = http[i].GET();
      
      String spots;
      switch(i) {
        case 0: spots = "A1,A2"; break;
        case 1: spots = "A3,A4"; break;
        case 2: spots = "B1,B2"; break;
        case 3: spots = "B3,B4"; break;
        case 4: spots = "C1,C2"; break;
        case 5: spots = "C3,C4"; break;
      }
      Serial.print("Channel ");
      Serial.print(i + 1);
      Serial.print(" (");
      Serial.print(spots);
      Serial.print(") Response: ");
      Serial.println(httpResponseCode);
      
      http[i].end();
    }
    Serial.println("===========================\n");
  } else {
    Serial.println("WiFi Not Connected!");
  }
}

// Function to read all spots in one position
void readSpotsAtPosition(bool isSecondPosition) {
  int detectionCounts[NUM_SERVOS] = {0};
  
  Serial.print("\n=== Reading Spots at ");
  Serial.print(isSecondPosition ? "150" : "0");
  Serial.println("° ===");
  
  // Take samples over 4 second period
  for(int sample = 0; sample < SAMPLES_PER_SPOT; sample++) {
    for(int i = 0; i < NUM_SERVOS; i++) {
      if(digitalRead(IR_PINS[i]) == LOW) {
        detectionCounts[i]++;
      }
    }
    delay(SAMPLE_DELAY);
  }
  
  // Process readings
  for(int i = 0; i < NUM_SERVOS; i++) {
    float occupancyRate = (float)detectionCounts[i] / SAMPLES_PER_SPOT;
    int spotIndex = i * 2 + (isSecondPosition ? 1 : 0); // Calculate spot index in allSpots array
    allSpots[spotIndex] = (occupancyRate > OCCUPANCY_THRESHOLD);
    
    String spotName;
    if (i < 2) spotName = "A" + String(spotIndex + 1);
    else if (i < 4) spotName = "B" + String(spotIndex - 3);
    else spotName = "C" + String(spotIndex - 7);
    
    Serial.print("Spot ");
    Serial.print(spotName);
    Serial.print(" (");
    Serial.print(occupancyRate * 100);
    Serial.print("% detection rate): ");
    Serial.println(allSpots[spotIndex] ? "OCCUPIED" : "EMPTY");
  }
  Serial.println("========================");
}

void setup() {
  Serial.begin(115200);
  while(!Serial) delay(10);  // Wait for Serial to be ready
  
  Serial.println("\nStarting Servo Test...");
  
  // Initialize I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  delay(100);
  
  // Initialize IR sensor pins
  for(int i = 0; i < NUM_SERVOS; i++) {
    pinMode(IR_PINS[i], INPUT);
  }
  
  // Scan for I2C devices
  scanI2C();
  
  // Initialize servo driver
  Serial.println("Initializing PCA9685...");
  if (!pwm.begin()) {
    Serial.println("PCA9685 not found! Check connections");
    while (1);
  }
  Serial.println("PCA9685 found successfully!");
  
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(50);  // 50 Hz update rate for servos
  Serial.println("PWM frequency set to 50Hz");
  
  delay(1000);  // Give time for servos to initialize
  
  // Add WiFi connection
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
}

void loop() {
  // Move all servos to 0° and read first spots
  Serial.println("\n=== Moving all servos to 0° ===");
  for (uint8_t i = 0; i < NUM_SERVOS; i++) {
    setServoAngle(servoChannels[i], 0);
    delay(100);
  }
  delay(500); // Let servos settle
  readSpotsAtPosition(false); // Read spots at 0°
  
  // Move all servos to 150° and read second spots
  Serial.println("\n=== Moving all servos to 150° ===");
  for (uint8_t i = 0; i < NUM_SERVOS; i++) {
    setServoAngle(servoChannels[i], 150);
    delay(100);
  }
  delay(500); // Let servos settle
  readSpotsAtPosition(true); // Read spots at 150°
  
  // Send all data to ThingSpeak simultaneously
  sendAllToThingSpeak();
  
  // Wait before next cycle (ThingSpeak needs 15s between updates)
  delay(15000);
}
