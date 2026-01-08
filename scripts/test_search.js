
const axios = require('axios');

async function testSearch() {
  try {
    // 1. Test basic search (all published)
    console.log('--- Test 1: All Published ---');
    const res1 = await axios.get('http://localhost:5000/api/tour/search');
    console.log('Count:', res1.data.data.total);
    console.log('Items:', res1.data.data.items.length);

    // 2. Test with high price range (user's setting)
    console.log('\n--- Test 2: Max Price 1000000 ---');
    const res2 = await axios.get('http://localhost:5000/api/tour/search?maxPrice=1000000');
    console.log('Count:', res2.data.data.total);

    // 3. Test with status draft (should be 0 via endpoint, but we can't test draft via this public endpoint easily if hardcoded)
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testSearch();
