import { runCSPMathTests } from './cspMath.test';
import { runFreeTierTests } from './freeTier.test';

async function main() {
  await runFreeTierTests();
  runCSPMathTests();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
