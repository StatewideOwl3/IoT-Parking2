#include <WiFi.h>
#include <HTTPClient.h>

// Replace these with your actual values
const char* ssid = "my_wifi";
const char* password = "pwd";

const char* apiKey = "5ZM4WBVZVHIBWB6B";
const int channelID = 2913587; // e.g. 1234567

#define IR1 15
#define IR2 16

void setup() {
  Serial.begin(115200);

  pinMode(IR1, INPUT);
  pinMode(IR2, INPUT);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi connected!");
}

void loop() {
  int s1 = digitalRead(IR1);
  int s2 = digitalRead(IR2);

  // Format: LOW = object detected → 1, HIGH = no object → 0
  int data1 = (s1 == LOW) ? 1 : 0;
  int data2 = (s2 == LOW) ? 1 : 0;

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    String url = "http://api.thingspeak.com/update?api_key=";
    url += apiKey;
    url += "&field1=" + String(data1);
    url += "&field2=" + String(data2);

    http.begin(url);
    int httpResponseCode = http.GET();
    http.end();

    Serial.print("Sent data to ThingSpeak. Response: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.println("Wi-Fi disconnected!");
  }

  delay(1000); // Send every second
}
