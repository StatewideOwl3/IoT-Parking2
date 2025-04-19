#include <ESP32Servo.h>

Servo myServo;
const int servoPin = 13;  // change this to whatever pin you used
const int irSensorPin = 15;  // IR sensor pin - change if needed

void setup() {
  Serial.begin(115200);  // Initialize Serial Monitor
  myServo.attach(servoPin);
  pinMode(irSensorPin, INPUT);  // Set IR sensor pin as input
  Serial.println("IR Sensor and Servo Tester Started");
}

void loop() {
  // Read IR sensor
  int irValue = digitalRead(irSensorPin);
  Serial.print("IR Sensor Reading at position ");

  myServo.write(45);
  Serial.print("LEFT (45°): ");
  Serial.println(irValue == LOW ? "Object Detected" : "No Object");
  delay(4000);

  myServo.write(135);
  Serial.print("RIGHT (90°): ");
  Serial.println(irValue == LOW ? "Object Detected" : "No Object");
  delay(4000);
  
  
  Serial.println("-------------------");
}