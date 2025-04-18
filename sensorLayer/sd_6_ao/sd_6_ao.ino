#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// PCA9685 driver (default I²C address 0x40)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Number of servos and their PCA9685 channels (0–15)
const uint8_t NUM_SERVOS = 6;
const uint8_t servoChannels[NUM_SERVOS] = { 0, 1, 2, 3, 4, 5 };

// IR sensor pin (shared)
const int irSensorPin = 15;

// Pulse limits for 0° and 180° (tweak if needed for your SG90s)
const uint16_t SERVOMIN = 150;   // ~1.0 ms
const uint16_t SERVOMAX = 600;   // ~2.0 ms

// Move one servo on `channel` to `angle` (0–180°)
void setServoAngle(uint8_t channel, float angle) {
  angle = constrain(angle, 0, 180);
  uint16_t pulse = SERVOMIN + (angle / 180.0) * (SERVOMAX - SERVOMIN);
  pwm.setPWM(channel, 0, pulse);
}

void setup() {
  Serial.begin(115200);
  Wire.begin();               // SDA=GPIO21, SCL=GPIO22 by default
  pwm.begin();
  pwm.setPWMFreq(50);         // 50 Hz for servos
  pinMode(irSensorPin, INPUT);
  delay(10);
  Serial.println("Starting simultaneous 6‑servo IR scan...");
}

void loop() {
  // --- Move all servos to 45° simultaneously ---
  for (uint8_t i = 0; i < NUM_SERVOS; i++) {
    setServoAngle(servoChannels[i], 45);
  }
  delay(500);  // give all servos time to reach 45°
  int irVal = digitalRead(irSensorPin);
  Serial.print("All servos @ 45° → ");
  Serial.println(irVal == LOW ? "Object Detected" : "No Object");
  delay(1000);

  // --- Move all servos to 135° simultaneously ---
  for (uint8_t i = 0; i < NUM_SERVOS; i++) {
    setServoAngle(servoChannels[i], 135);
  }
  delay(500);  // give all servos time to reach 135°
  irVal = digitalRead(irSensorPin);
  Serial.print("All servos @ 135° → ");
  Serial.println(irVal == LOW ? "Object Detected" : "No Object");
  delay(1000);

  Serial.println("---------------------------");
  delay(2000);  // pause before next cycle
}
