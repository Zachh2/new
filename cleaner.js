const fs = require('fs');
const https = require('https');

// Load package.json
const packageJsonPath = './package.json';
const packageData = JSON.parse(
  fs.readFileSync(packageJsonPath, 'utf8')
);

// Helper function to check if a package exists on the npm registry
function checkPackageExists(packageName) {
  return new Promise((resolve) => {
    // encodeURIComponent correctly handles scoped packages:
    // @distube/ytdl-core -> %40distube%2Fytdl-core
    const encodedName = encodeURIComponent(packageName);
    const url = `https://registry.npmjs.org/${encodedName}`;

    const request = https.get(url, (res) => {
      // Consume response data so the connection can be reused/freed
      res.resume();

      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    request.on('error', (error) => {
      console.error(`\nError checking ${packageName}: ${error.message}`);
      resolve(false);
    });

    // Prevent the script from hanging forever
    request.setTimeout(10000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function processSection(dependencies) {
  if (!dependencies) return {};

  const cleanedDeps = {};

  for (const [name, version] of Object.entries(dependencies)) {
    process.stdout.write(`Checking package: ${name}... `);

    const exists = await checkPackageExists(name);

    if (exists) {
      console.log('✅ Exists');
      cleanedDeps[name] = version;
    } else {
      console.log('❌ Does NOT exist (Removing)');
    }
  }

  return cleanedDeps;
}

async function main() {
  try {
    console.log(
      '🔍 Starting validation of package.json dependencies...\n'
    );

    if (packageData.dependencies) {
      console.log('[Checking Dependencies]');
      packageData.dependencies = await processSection(
        packageData.dependencies
      );
    }

    if (packageData.devDependencies) {
      console.log('\n[Checking DevDependencies]');
      packageData.devDependencies = await processSection(
        packageData.devDependencies
      );
    }

    // Save the updated package.json
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(packageData, null, 2) + '\n',
      'utf8'
    );

    console.log(
      '\n✨ Done! Non-existent packages have been automatically removed, and package.json has been updated.'
    );
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exitCode = 1;
  }
}

main();