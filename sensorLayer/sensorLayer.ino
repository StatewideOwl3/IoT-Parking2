#include <WiFi.h>
#include <PubSubClient.h> // MQTT library
#include <ESP32Servo.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h> // For JSON formatting

// ====== Wi-Fi Credentials ======
const char* ssid = "iPhone";
const char* password = "DXBTURFD";

// ====== MQTT Configuration ======
const char* mqtt_server = "172.20.10.2"; // e.g. "192.168.1.100" or "broker.example.com"
const int mqtt_port = 1883;
const char* mqtt_username = ""; // Leave empty if not using authentication
const char* mqtt_password = ""; // Leave empty if not using authentication
const char* mqtt_client_id = "ESP32_ParkingSystem"; // Should be unique

// MQTT Topics - one topic per sensor pair
const char* mqtt_topics[6] = {
  "parking/sensor1",  // Channel 1 - spots 1 & 2
  "parking/sensor2",  // Channel 2 - spots 3 & 4
  "parking/sensor3",  // Channel 3 - spots 5 & 6
  "parking/sensor4",  // Channel 4 - spots 7 & 8
  "parking/sensor5",  // Channel 5 - spots 9 & 10
  "parking/sensor6"   // Channel 6 - spots 11 & 12
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
TaskHandle_t mqttPublishTasks[6];

// WiFi and MQTT client initialization
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ====== WiFi Setup ======
void connectToWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

// ====== MQTT Setup and Reconnection ======
void setupMQTT() {
  mqttClient.setServer(mqtt_server, mqtt_port);
  
  // Optional callback for receiving messages
  mqttClient.setCallback([](char* topic, byte* payload, unsigned int length) {
    // Handle incoming messages if needed
    Serial.print("Message received on topic: ");
    Serial.println(topic);
  });
}

bool reconnectMQTT() {
  if (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    // Attempt to connect with authentication if provided
    bool connected = false;
    if (strlen(mqtt_username) > 0) {
      connected = mqttClient.connect(mqtt_client_id, mqtt_username, mqtt_password);
    } else {
      connected = mqttClient.connect(mqtt_client_id);
    }
    
    if (connected) {
      Serial.println("connected!");
      return true;
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" will try again in next cycle");
      return false;
    }
  }
  return true;
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

// ====== MQTT Publish Task ======
void mqttPublishTask(void* parameter) {
  int channelIndex = (int)parameter;
  const char* topic = mqtt_topics[channelIndex];
  
  while (true) {
    // Wait for notification to start sending
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    
    // Get the current readings
    int spot1, spot2;
    xSemaphoreTake(readingMutex, portMAX_DELAY);
    spot1 = spotReadings[channelIndex][0];
    spot2 = spotReadings[channelIndex][1];
    xSemaphoreGive(readingMutex);
    
    // Check MQTT connection and reconnect if needed
    if (!mqttClient.connected()) {
      reconnectMQTT();
    }
    
    // Format data as JSON
    StaticJsonDocument<200> doc;
    doc["sensorId"] = channelIndex + 1;
    doc["spot1"] = spot1;
    doc["spot2"] = spot2;
    doc["timestamp"] = millis();
    
    char jsonBuffer[200];
    serializeJson(doc, jsonBuffer);
    
    // Publish to MQTT topic
    if (mqttClient.connected()) {
      bool published = mqttClient.publish(topic, jsonBuffer, true); // retained message
      
      Serial.print("MQTT Publish to topic ");
      Serial.print(topic);
      Serial.print(": ");
      Serial.println(published ? "Success" : "Failed");
      Serial.println(jsonBuffer);
    } else {
      Serial.println("MQTT Disconnected! Can't send data.");
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
  
  // Connect to WiFi
  connectToWiFi();
  
  // Setup MQTT
  setupMQTT();
  reconnectMQTT();
  
  // Create mutex for safe access to readings
  readingMutex = xSemaphoreCreateMutex();
  
  // Create tasks for parallel IR reading and MQTT publishing
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
      mqttPublishTask,   // Task function
      "MQTTPublishTask", // Name
      4000,              // Stack size
      (void*)i,          // Parameter (channel index)
      1,                 // Priority
      &mqttPublishTasks[i], // Task handle
      1                  // Core (1)
    );
  }
}

// ====== Main Loop ======
void loop() {
  static unsigned long lastServoMoveTime = 0;
  static int servoState = 0; // 0 = center, 1 = left, 2 = right
  
  // Run MQTT loop in the main loop to keep the connection alive
  mqttClient.loop();
  
  // Ensure MQTT is connected
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  
  unsigned long currentTime = millis();
  
  // Move servos at specific intervals
  if (currentTime - lastServoMoveTime >= 10000) { // Every 10 seconds
    lastServoMoveTime = currentTime;
    
    switch (servoState) {
      case 0: // From center to left (0°)
        for (int i = 0; i < 6; i++) {
          servos[i].write(0);
          // Notify the corresponding IR reading task
          xTaskNotifyGive(irReadingTasks[i]);
        }
        servoState = 1;
        break;
        
      case 1: // From left to right (180°)
        for (int i = 0; i < 6; i++) {
          servos[i].write(180);
          // Notify the corresponding IR reading task
          xTaskNotifyGive(irReadingTasks[i]);
        }
        servoState = 2;
        break;
        
      case 2: // From right to center (90°)
        for (int i = 0; i < 6; i++) {
          servos[i].write(90);
          
          // Notify the MQTT publishing task after both spots are read
          xTaskNotifyGive(mqttPublishTasks[i]);
        }
        servoState = 0;
        break;
    }
  }
}
