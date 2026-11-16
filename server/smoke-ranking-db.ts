import "dotenv/config";
import { RankingRepository } from "@/app/api-services/repositories/ranking.repository";
import { QualificationRepository } from "@/app/api-services/repositories/qualification.repository";
import { RankingService } from "@/app/api-services/services/ranking.service";
import { indexgenerater } from "@/app/api-services/services/indexgenerater";
import { createAppPool } from "./db/pool";

async function main() {
  const pool = createAppPool();
  try {
    const service = new RankingService(
      new RankingRepository(pool),
      new QualificationRepository(pool),
      new indexgenerater(pool),
    );
    const ws = await service.weightSet("RWS00001");
    process.stdout.write(`weight-set ${ws.code} components=${ws.components.length} strategy=${ws.orderingStrategy}\n`);
    const classes = await service.customerClasses();
    process.stdout.write(`customer-classes ${classes.items.length}\n`);
    const result = await service.run("smoke", { trigger: "ON_DEMAND" });
    process.stdout.write(
      `run ${result.run.id} pool=${result.run.poolSize} demand=${result.run.totalDemand} ${result.run.totalDemandUomCode} fallbackClass=${result.run.fallbackClassUsed}\n`,
    );
    if (result.items[0]) {
      process.stdout.write(
        `top #${result.items[0].rankPosition} ${result.items[0].orderNo} score=${result.items[0].totalScore} band=${result.items[0].riskBand} classSource=${result.items[0].classSource}\n`,
      );
    }
    const feed = await service.pool(new URLSearchParams());
    process.stdout.write(`pool feed total=${feed.total} runId=${feed.runId}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
