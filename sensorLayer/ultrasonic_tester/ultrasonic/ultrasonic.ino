// HC-SR04 Ultrasonic Sensor Speed Detection
// Trigger Pin -> GPIO 5
// Echo Pin -> GPIO 18

const int TRIG_PIN = 5;  // GPIO pin connected to Trigger
const int ECHO_PIN = 18; // GPIO pin connected to Echo

// Constants for speed calculation
const int MEASUREMENT_INTERVAL = 100; // Time between measurements in ms
const float SOUND_SPEED = 0.034;      // Speed of sound in cm/microsecond

// Variables to store measurements
float previousDistance = 0;
unsigned long previousTime = 0;

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT); 
  pinMode(ECHO_PIN, INPUT);
  
  Serial.println("Ultrasonic Speed Detection System Started");
  Serial.println("----------------------------------------");
}

float measureDistance() {
  // Clear trigger pin
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  
  // Send 10μs pulse to trigger
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // Measure the response from echo pin
  long duration = pulseIn(ECHO_PIN, HIGH);
  
  // Calculate distance in cm
  return duration * SOUND_SPEED / 2;
}

void loop() {
  // Get current measurement
  float currentDistance = measureDistance();
  unsigned long currentTime = millis();
  
  // Only calculate speed if we have a previous measurement
  if (previousDistance > 0) {
    // Calculate time difference in seconds
    float timeDiff = (currentTime - previousTime) / 1000.0;
    
    // Calculate distance difference in cm (negative means object is approaching)
    float distanceDiff = currentDistance - previousDistance;
    
    // Calculate speed in cm/s (absolute value)
    float speed = abs(distanceDiff / timeDiff);
    
    // Print results if object is within reasonable range (< 400cm)
    if (currentDistance < 400) {
      Serial.print("Distance: ");
      Serial.print(currentDistance);
      Serial.print(" cm, Speed: ");
      Serial.print(speed);
      Serial.println(" cm/s");
      
      // Indicate if object is approaching or moving away
      if (distanceDiff < 0) {
        Serial.println("Object is approaching");
      } else if (distanceDiff > 0) {
        Serial.println("Object is moving away");
      }
      Serial.println("----------------------------------------");
    }
  }
  
  // Store current measurements for next iteration
  previousDistance = currentDistance;
  previousTime = currentTime;
  
  // Wait before next measurement
  delay(MEASUREMENT_INTERVAL);
}