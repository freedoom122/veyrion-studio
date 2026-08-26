require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { migrate } = require('./migrate');
const { seed } = require('./seed');

console.log('=== Veyrion Database Setup ===');
migrate();
seed();
console.log('=== Setup Complete ===');
