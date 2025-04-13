#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <WiFiClientSecure.h>

// ====== Wi-Fi Credentials ======
const char* ssid = "iPhone";
const char* password = "DXBTURFD";

// ====== ThingSpeak API Keys and Channels ======
// Replace these with your actual API keys and channel IDs
//THESE HAVE TO BE WRITE KEYS
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

// Create servo objects
Servo servos[6];

// Reading variables
volatile int spotReadings[6][2] = {{0}}; // [sensor][spot]
volatile bool spotOccupied[6][2] = {{false}}; // Track occupation status
SemaphoreHandle_t readingMutex;  // For safe access to readings across tasks

// Task handles for parallel operations
TaskHandle_t irReadingTasks[6];
TaskHandle_t thingSpeakTasks[6];

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
    
    // For Spot 1 (servo at 0°)
    int consecutiveDetections = 0;
    unsigned long startTime = millis();
    bool isOccupied = false;
    
    // Read for 5 seconds continuously
    while (millis() - startTime < 5000) {
      if (digitalRead(sensorPin) == LOW) {  // Object detected
        consecutiveDetections++;
      } else {
        consecutiveDetections = 0;
      }
      
      // If we have consistently detected an object
      if (consecutiveDetections > 10) {
        isOccupied = true;
      }
      
      delay(50);  // Small delay between readings
    }
    
    // Update the reading securely
    xSemaphoreTake(readingMutex, portMAX_DELAY);
    spotOccupied[sensorIndex][0] = isOccupied;
    spotReadings[sensorIndex][0] = isOccupied ? 1 : 0;
    xSemaphoreGive(readingMutex);
    
    // Wait for next notification (for Spot 2)
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    
    // For Spot 2 (servo at 180°)
    consecutiveDetections = 0;
    startTime = millis();
    isOccupied = false;
    
    // Read for 5 seconds continuously
    while (millis() - startTime < 5000) {
      if (digitalRead(sensorPin) == LOW) {  // Object detected
        consecutiveDetections++;
      } else {
        consecutiveDetections = 0;
      }
      
      // If we have consistently detected an object
      if (consecutiveDetections > 10) {
        isOccupied = true;
      }
      
      delay(50);  // Small delay between readings
    }
    
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

// ====== Setup ======
void setup() {
  Serial.begin(115200);
  
  // Initialize IR sensor pins
  for (int i = 0; i < 6; i++) {
    pinMode(IR_SENSOR_PINS[i], INPUT);
  }

  // Initialize servo motors
  for (int i = 0; i < 6; i++) {
    servos[i].setPeriodHertz(50);
    servos[i].attach(SERVO_PINS[i]);
    servos[i].write(90);  // start all servos at center position
    delay(200); // Small delay between attaching servos
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
  
  Serial.println("System initialized. Starting parking monitoring...");
}

// ====== Main Loop ======
void loop() {
  // All servos at center position (90°) for 10 seconds
  Serial.println("=== ALL SERVOS AT CENTER POSITION (90°) ===");
  for (int i = 0; i < 6; i++) {
    servos[i].write(90);
  }
  delay(10000); // 10 seconds at center
  
  // All servos at Spot 1 position (0°) for 5 seconds
  Serial.println("=== ALL SERVOS AT POSITION 0° - SCANNING SPOT 1 ===");
  for (int i = 0; i < 6; i++) {
    servos[i].write(0);
  }
  delay(100); // Short delay for servos to start moving
  
  // Start all IR sensor reading tasks simultaneously for Spot 1
  for (int i = 0; i < 6; i++) {
    xTaskNotifyGive(irReadingTasks[i]);
  }
  
  // Wait for 5 seconds for readings
  delay(5000);
  
  // All servos at Spot 2 position (180°) for 5 seconds
  Serial.println("=== ALL SERVOS AT POSITION 180° - SCANNING SPOT 2 ===");
  for (int i = 0; i < 6; i++) {
    servos[i].write(180);
  }
  delay(100); // Short delay for servos to start moving
  
  // Start all IR sensor reading tasks simultaneously for Spot 2
  for (int i = 0; i < 6; i++) {
    xTaskNotifyGive(irReadingTasks[i]);
  }
  
  // Wait for 5 seconds for readings
  delay(5000);
  
  // Return all servos to center position
  for (int i = 0; i < 6; i++) {
    servos[i].write(90);
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
    Serial.print("Sensor ");
    Serial.print(i + 1);
    Serial.println(":");
    Serial.print("  Spot 1: ");
    Serial.println(spotReadings[i][0] == 1 ? "OCCUPIED" : "EMPTY");
    Serial.print("  Spot 2: ");
    Serial.println(spotReadings[i][1] == 1 ? "OCCUPIED" : "EMPTY");
  }
  xSemaphoreGive(readingMutex);
  
  Serial.println("Completed full cycle for all sensors");
  delay(1000); // Short delay before next cycle
}
