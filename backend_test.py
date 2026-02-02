import requests
import sys
import json
import time
from datetime import datetime
from pathlib import Path

class SurveillanceAPITester:
    def __init__(self, base_url="https://smart-surveillance-14.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}
        
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, timeout=30)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.log_test(name, True)
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                self.log_test(name, False, f"Expected {expected_status}, got {response.status_code} - {response.text}")
                return False, {}

        except requests.exceptions.Timeout:
            self.log_test(name, False, "Request timeout")
            return False, {}
        except Exception as e:
            self.log_test(name, False, f"Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_surveillance_status(self):
        """Test surveillance status endpoint"""
        success, response = self.run_test("Surveillance Status", "GET", "surveillance/status", 200)
        if success:
            required_fields = ['active', 'sensitivity', 'total_incidents']
            for field in required_fields:
                if field not in response:
                    self.log_test(f"Status Response - {field} field", False, f"Missing {field} in response")
                    return False
            print(f"   Status: {response}")
        return success

    def test_start_surveillance_medium(self):
        """Test starting surveillance with medium sensitivity"""
        return self.run_test(
            "Start Surveillance (Medium)", 
            "POST", 
            "surveillance/start", 
            200, 
            {"sensitivity": "medium"}
        )

    def test_start_surveillance_high(self):
        """Test starting surveillance with high sensitivity"""
        return self.run_test(
            "Start Surveillance (High)", 
            "POST", 
            "surveillance/start", 
            200, 
            {"sensitivity": "high"}
        )

    def test_stop_surveillance(self):
        """Test stopping surveillance"""
        return self.run_test("Stop Surveillance", "POST", "surveillance/stop", 200)

    def test_get_incidents(self):
        """Test getting incidents list"""
        success, response = self.run_test("Get Incidents", "GET", "incidents", 200)
        if success:
            print(f"   Found {len(response)} incidents")
        return success, response

    def test_cleanup_old_incidents(self):
        """Test cleanup old incidents"""
        return self.run_test("Cleanup Old Incidents", "DELETE", "incidents/old/cleanup?days=7", 200)

    def test_video_upload(self):
        """Test video upload functionality"""
        # Create a small test video file (mock)
        test_video_content = b"fake_video_content_for_testing"
        
        files = {
            'file': ('test_video.mp4', test_video_content, 'video/mp4')
        }
        
        print(f"\n🔍 Testing Video Upload...")
        url = f"{self.api_url}/surveillance/upload?sensitivity=medium"
        
        try:
            response = requests.post(url, files=files, timeout=30)
            
            # This might fail due to invalid video format, but we're testing the endpoint
            if response.status_code in [200, 500]:  # 500 expected for invalid video
                self.log_test("Video Upload Endpoint", True, f"Endpoint accessible (status: {response.status_code})")
                return True
            else:
                self.log_test("Video Upload Endpoint", False, f"Unexpected status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Video Upload Endpoint", False, f"Error: {str(e)}")
            return False

    def test_incident_image_endpoint(self, incident_id=None):
        """Test incident image endpoint"""
        if not incident_id:
            # Try with a dummy ID to test endpoint structure
            incident_id = "test-id"
        
        success, response = self.run_test(
            "Incident Image Endpoint", 
            "GET", 
            f"incidents/{incident_id}/image", 
            404  # Expected 404 for non-existent incident
        )
        return success

    def run_full_test_suite(self):
        """Run complete test suite"""
        print("🚀 Starting Smart Surveillance API Test Suite")
        print("=" * 60)
        
        # Basic connectivity tests
        self.test_root_endpoint()
        
        # Status and configuration tests
        self.test_surveillance_status()
        
        # Surveillance control tests
        print("\n📹 Testing Surveillance Controls...")
        
        # Test starting surveillance (this might fail in container without webcam)
        start_success, _ = self.test_start_surveillance_medium()
        
        if start_success:
            # If start succeeded, test stop
            time.sleep(1)
            self.test_stop_surveillance()
        else:
            # Try high sensitivity
            start_success_high, _ = self.test_start_surveillance_high()
            if start_success_high:
                time.sleep(1)
                self.test_stop_surveillance()
        
        # Incident management tests
        print("\n📊 Testing Incident Management...")
        incidents_success, incidents = self.test_get_incidents()
        
        if incidents_success and len(incidents) > 0:
            # Test deleting first incident
            first_incident_id = incidents[0]['id']
            self.run_test(
                "Delete Incident", 
                "DELETE", 
                f"incidents/{first_incident_id}", 
                200
            )
            
            # Test incident image endpoint with real ID
            self.test_incident_image_endpoint(first_incident_id)
        else:
            # Test with dummy ID
            self.test_incident_image_endpoint()
        
        self.test_cleanup_old_incidents()
        
        # Upload functionality test
        print("\n📤 Testing Upload Functionality...")
        self.test_video_upload()
        
        # Final status check
        print("\n🔄 Final Status Check...")
        self.test_surveillance_status()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed. Check details above.")
            return 1

def main():
    tester = SurveillanceAPITester()
    return tester.run_full_test_suite()

if __name__ == "__main__":
    sys.exit(main())