#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>

// ====== Wi-Fi Credentials ======
const char* ssid = "iPhone";
const char* password = "DXBTURFD";

// ====== ThingSpeak API Key and Channel ======
const char* apiKey = "5ZM4WBVZVHIBWB6B";  // replace with yours

// ====== Pin Definitions ======
#define IR_SENSOR_PIN 15
#define SERVO_PIN     13

Servo myServo;

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

// ====== IR Scan Function ======
bool isSpotOccupiedStable() {
  unsigned long startTime = millis();
  while (millis() - startTime < 5000) {
    if (digitalRead(IR_SENSOR_PIN) == HIGH) {
      return false;
    }
    delay(100);
  }
  return true;
}

// ====== ThingSpeak Send Function ======
void sendToThingSpeak(int spot1, int spot2) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = "http://api.thingspeak.com/update?api_key=" + String(apiKey);
    url += "&field1=" + String(spot1);
    url += "&field2=" + String(spot2);

    http.begin(url);
    int response = http.GET();
    http.end();

    Serial.print("ThingSpeak Response Code: ");
    Serial.println(response);
  } else {
    Serial.println("Wi-Fi Disconnected! Can't send data.");
  }
}

// ====== Setup ======
void setup() {
  Serial.begin(115200);
  pinMode(IR_SENSOR_PIN, INPUT);

  myServo.setPeriodHertz(50);
  myServo.attach(SERVO_PIN);
  myServo.write(90);  // start at center
  delay(1000);

  connectToWiFi();
}

// ====== Main Loop ======
void loop() {
  int spot1 = 0;
  int spot2 = 0;

  // Move to Spot 1
  myServo.write(0);
  Serial.println("Scanning Spot 1...");
  delay(5000);
  spot1 = isSpotOccupiedStable() ? 1 : 0;

  // Move to Spot 2
  myServo.write(180);
  Serial.println("Scanning Spot 2...");
  delay(5000);
  spot2 = isSpotOccupiedStable() ? 1 : 0;

  // Report to Serial
  Serial.println("|||||||||||||||||||||||||||||||");
  Serial.println("PARKING STATUS REPORT:");
  Serial.print("Spot 1: ");
  Serial.println(spot1 == 1 ? "OCCUPIED" : "EMPTY");
  Serial.print("Spot 2: ");
  Serial.println(spot2 == 1 ? "OCCUPIED" : "EMPTY");
  Serial.println("|||||||||||||||||||||||||||||||");

  // Send to ThingSpeak
  sendToThingSpeak(spot1, spot2);

  // Return to center
  myServo.write(90);

  // Wait before next cycle
  delay(10000); // 10 seconds
}
