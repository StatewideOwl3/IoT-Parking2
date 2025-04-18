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
  
  myServo.write(0);
  Serial.print("0°: ");
  Serial.println(irValue == LOW ? "Object Detected" : "No Object");
  delay(1000);

  myServo.write(90);
  Serial.print("90°: ");
  Serial.println(irValue == LOW ? "Object Detected" : "No Object");
  delay(4000);

  myServo.write(180);
  Serial.print("180°: ");
  Serial.println(irValue == LOW ? "Object Detected" : "No Object");
  delay(1000);

  myServo.write(90);
  Serial.print("90°: ");
  Serial.println(irValue == LOW ? "Object Detected" : "No Object");
  delay(4000);

  myServo.write(0);
  Serial.print("0°: ");
  Serial.println(irValue == LOW ? "Object Detected" : "No Object");
  delay(1000);
  
  Serial.println("-------------------");
}