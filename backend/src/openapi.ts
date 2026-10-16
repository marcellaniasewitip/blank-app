import 'reflect-metadata';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createApp } from './bootstrap';

/** Generate the OpenAPI contract into /shared/openapi.json (§2: the spec is the contract). */
async function main(): Promise<void> {
  process.env.JOBS_DRIVER = 'memory';
  const app = await createApp({ logger: false });
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Cooper Waters API')
      .setDescription('Phase 1 REST API. Money is integer toea (1 PGK = 100 toea). Times are UTC ISO-8601.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  const out = join(__dirname, '..', '..', 'shared');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'openapi.json'), JSON.stringify(doc, null, 2) + '\n');
  await app.close();
  // eslint-disable-next-line no-console
  console.log(`Wrote ${join(out, 'openapi.json')} (${Object.keys(doc.paths).length} paths)`);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
