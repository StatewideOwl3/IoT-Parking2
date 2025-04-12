#include <WiFi.h>
#include <PubSubClient.h> // MQTT library
#include <ESP32Servo.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h> // For JSON formatting

// ====== Wi-Fi Credentials ======
const char* ssid = "iPhone";           // EDIT: Replace with your WiFi SSID
const char* password = "DXBTURFD";     // EDIT: Replace with your WiFi password

// ====== MQTT Cloud Configuration ======
// EDIT: Replace with your HiveMQ Cloud credentials
const char* mqtt_server = "f68a0a1321584a169cd42818b2fcad8a.s2.eu.hivemq.cloud"; // Replace CLUSTER-ID with your HiveMQ Cluster ID
const int mqtt_port = 8883;           // Secure MQTT port (not WebSocket)
const char* mqtt_username = "team35"; // EDIT: Replace with your HiveMQ username
const char* mqtt_password = "Team35_Admin"; // EDIT: Replace with your HiveMQ password
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

// ====== HiveMQ Cloud Root CA Certificate ======
// EDIT: You might need to update this certificate if it changes
const char* root_ca = R"(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)";

// WiFi and MQTT client initialization
WiFiClientSecure espClient;
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
  // Set up SSL certificate for secure connection
  espClient.setCACert(root_ca);
  
  // Set MQTT server and port
  mqttClient.setServer(mqtt_server, mqtt_port);
  
  // Optional callback for receiving messages
  mqttClient.setCallback([](char* topic, byte* payload, unsigned int length) {
    // Handle incoming messages if needed
    Serial.print("Message received on topic: ");
    Serial.println(topic);
    
    // Print message payload
    char message[length + 1];
    memcpy(message, payload, length);
    message[length] = '\0';
    Serial.print("Message content: ");
    Serial.println(message);
  });
  
  // Set buffer size for larger messages
  mqttClient.setBufferSize(512);
}

bool reconnectMQTT() {
  if (!mqttClient.connected()) {
    Serial.print("Attempting MQTT Cloud connection...");
    
    // HiveMQ Cloud always requires authentication
    bool connected = mqttClient.connect(mqtt_client_id, mqtt_username, mqtt_password);
    
    if (connected) {
      Serial.println("connected to HiveMQ Cloud!");
      
      // Subscribe to any command topics if needed
      // mqttClient.subscribe("parking/commands");
      
      // Publish a connected status message
      StaticJsonDocument<200> doc;
      doc["device"] = mqtt_client_id;
      doc["status"] = "connected";
      doc["ip"] = WiFi.localIP().toString();
      doc["uptime"] = millis();
      
      char buffer[256];
      serializeJson(doc, buffer);
      mqttClient.publish("parking/system/status", buffer);
      
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
    doc["device"] = mqtt_client_id;
    
    char jsonBuffer[200];
    serializeJson(doc, jsonBuffer);
    
    // Publish to MQTT topic
    if (mqttClient.connected()) {
      bool published = mqttClient.publish(topic, jsonBuffer, true); // retained message
      
      // Also publish to individual spot topics
      char spot1Topic[50], spot2Topic[50];
      sprintf(spot1Topic, "%s/spot1", topic);
      sprintf(spot2Topic, "%s/spot2", topic);
      
      // Create and publish spot-specific messages
      StaticJsonDocument<100> spot1Doc, spot2Doc;
      spot1Doc["spot_id"] = String("spot-") + String(channelIndex+1) + String("-1");
      spot1Doc["status"] = spot1;
      spot1Doc["timestamp"] = millis();
      
      spot2Doc["spot_id"] = String("spot-") + String(channelIndex+1) + String("-2");
      spot2Doc["status"] = spot2;
      spot2Doc["timestamp"] = millis();
      
      char spot1Buffer[100], spot2Buffer[100];
      serializeJson(spot1Doc, spot1Buffer);
      serializeJson(spot2Doc, spot2Buffer);
      
      mqttClient.publish(spot1Topic, spot1Buffer, true);
      mqttClient.publish(spot2Topic, spot2Buffer, true);
      
      Serial.print("MQTT Publish to topic ");
      Serial.print(topic);
      Serial.print(": ");
      Serial.println(published ? "Success" : "Failed");
      Serial.println(jsonBuffer);
    } else {
      Serial.println("MQTT Cloud Disconnected! Can't send data.");
      reconnectMQTT(); // Try to reconnect
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
