// Test script to check API connectivity
const API_KEY = 'api-AB7psQuumDdjVHLTPYMDghH2xUgaKcuJZVvwReMMsxM9iQBaYJg/BrelRUX07neH';
const API_BASE_URL = 'https://api2.bankstatementconverter.com/api/v1';

async function testAPI() {
  console.log('Testing API connectivity...');
  console.log('API Base URL:', API_BASE_URL);
  console.log('API Key:', API_KEY ? '***' + API_KEY.slice(-4) : 'Not set');
  
  let uploadedUuid = null;
  
  try {
    // Test the actual upload endpoint
    console.log('\n1. Testing upload endpoint...');
    const formData = new FormData();
    // Create a dummy PDF file for testing
    const dummyFile = new File(['%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n149\n%%EOF'], 'test.pdf', { type: 'application/pdf' });
    formData.append('file', dummyFile);
    
    const uploadResponse = await fetch(`${API_BASE_URL}/BankStatement`, {
      method: 'POST',
      headers: {
        'Authorization': API_KEY,
      },
      body: formData
    });
    
    console.log('Upload endpoint status:', uploadResponse.status);
    if (uploadResponse.ok) {
      const uploadData = await uploadResponse.json();
      console.log('Upload response:', uploadData);
      uploadedUuid = uploadData[0]?.uuid;
      console.log('Uploaded UUID:', uploadedUuid);
    } else {
      const errorText = await uploadResponse.text();
      console.log('Upload error response:', errorText);
    }
  } catch (error) {
    console.error('Upload test failed:', error.message);
  }
  
  if (uploadedUuid) {
    try {
      // Test the status endpoint with the actual UUID
      console.log('\n2. Testing status endpoint with actual UUID...');
      const statusResponse = await fetch(`${API_BASE_URL}/BankStatement/status`, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([uploadedUuid])
      });
      
      console.log('Status endpoint status:', statusResponse.status);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log('Status response:', statusData);
      } else {
        const errorText = await statusResponse.text();
        console.log('Status error response:', errorText);
      }
    } catch (error) {
      console.error('Status test failed:', error.message);
    }
    
    try {
      // Test the convert endpoint with the actual UUID
      console.log('\n3. Testing convert endpoint with actual UUID...');
      const convertResponse = await fetch(`${API_BASE_URL}/BankStatement/convert?format=JSON`, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([uploadedUuid])
      });
      
      console.log('Convert endpoint status:', convertResponse.status);
      if (convertResponse.ok) {
        const convertData = await convertResponse.json();
        console.log('Convert response:', convertData);
      } else {
        const errorText = await convertResponse.text();
        console.log('Convert error response:', errorText);
      }
    } catch (error) {
      console.error('Convert test failed:', error.message);
    }
  }
  
  console.log('\nAPI test completed.');
}

testAPI().catch(console.error); 