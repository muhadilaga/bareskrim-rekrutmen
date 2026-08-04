const { execSync } = require('child_process');
try {
  const output = execSync('npx tsc --noEmit', { 
    cwd: 'C:\\Users\\LTSC\\bareskrim-rekrutmen', 
    encoding: 'utf8',
    timeout: 60000 
  });
  console.log('SUCCESS');
  console.log(output);
} catch (e) {
  console.log('ERRORS FOUND');
  console.log(e.stdout || '');
  console.log(e.stderr || '');
}
