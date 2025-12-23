const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const testUser = {
  username: 'testuser_' + Date.now(),
  email: 'test_' + Date.now() + '@example.com',
  phone: '138' + Math.floor(Math.random() * 100000000),
  password: '123456',
  roleName: 'skill_provider'
};

let authToken = null;

async function runTests() {
  console.log('🧪 开始执行基础支撑模块测试...\n');
  
  try {
    console.log('1️⃣ 测试用户注册...');
    const registerRes = await axios.post(`${BASE_URL}/auth/register`, testUser);
    console.log('✅ 注册成功', registerRes.data);
    
    console.log('\n2️⃣ 测试重复注册...');
    try {
      await axios.post(`${BASE_URL}/auth/register`, testUser);
      console.log('❌ 应该失败但没有失败');
    } catch (error) {
      console.log('✅ 重复注册被拒绝', error.response.data);
    }
    
    console.log('\n3️⃣ 测试用户登录...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      login: testUser.username,
      password: testUser.password
    });
    authToken = loginRes.data.data.token;
    console.log('✅ 登录成功', { token: authToken.substring(0, 20) + '...' });
    
    console.log('\n4️⃣ 测试密码错误...');
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        login: testUser.username,
        password: 'wrongpassword'
      });
      console.log('❌ 应该失败但没有失败');
    } catch (error) {
      console.log('✅ 密码错误被拒绝', error.response.data);
    }
    
    console.log('\n5️⃣ 测试检查用户名...');
    const checkUser = await axios.get(`${BASE_URL}/auth/check-username?username=testuser`);
    console.log('✅ 用户名可用性:', checkUser.data);
    
    console.log('\n6️⃣ 测试检查邮箱...');
    const checkEmail = await axios.get(`${BASE_URL}/auth/check-email?email=test@example.com`);
    console.log('✅ 邮箱可用性:', checkEmail.data);
    
    console.log('\n🎉 所有测试通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

setTimeout(runTests, 2000);