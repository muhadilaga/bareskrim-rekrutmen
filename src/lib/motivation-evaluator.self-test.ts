import { strict as assert } from "node:assert";
import { evaluateMotivation } from "@/lib/motivation-evaluator";

assert.equal(evaluateMotivation("ok").status, "REJECTED");
assert.equal(evaluateMotivation("Saya ingin bergabung").status, "REJECTED");
assert.equal(
  evaluateMotivation("Saya ingin belajar lebih banyak soal kedisiplinan dan pengalaman baru di unit ini.").status,
  "APPROVED"
);
assert.equal(
  evaluateMotivation("Saya ingin masuk Bareskrim Polri karena ingin belajar reserse, melatih disiplin, dan mengabdi dengan integritas penuh.").status,
  "APPROVED"
);
console.log("motivation evaluator self-test: OK");
