import 'dotenv/config';
import { CosmosClient } from '@azure/cosmos';
import * as ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// --- Interfaces matching Cosmos DB Shapes ---

interface EventDoc {
  id: string;
  name: string;
  description: string;
  date: string;
  location: string;
  createdBy: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  whiskeyCount: number;
}

interface WhiskeyDoc {
  id: string;
  name: string;
  createdBy: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  globalAverageRating: number;
  globalRatingCount: number;
}

interface EventWhiskeyDoc {
  id: string;
  eventId: string;
  whiskeyId: string;
  addedBy: string;
  addedByUserId: string;
  createdAt: string;
  averageRating: number;
  ratingCount: number;
}

interface RatingDoc {
  id: string;
  eventId: string;
  whiskeyId: string;
  userId: string;
  userName: string;
  score: number;
  createdAt: string;
  updatedAt: string;
}

// --- Helper Functions ---

function roundToOneDecimal(num: number): number {
  return Math.round(num * 10) / 10;
}

function parseDateCell(cellValue: any): string | null {
  if (!cellValue) return null;
  if (cellValue instanceof Date) {
    return cellValue.toISOString().split('T')[0];
  }
  if (typeof cellValue === 'string') {
    return cellValue;
  }
  return String(cellValue);
}

function parseScoreCell(cellValue: any): number | null {
  if (cellValue === null || cellValue === undefined) return null;
  
  // Handle formula objects from exceljs
  if (typeof cellValue === 'object' && cellValue !== null && 'result' in cellValue) {
    cellValue = cellValue.result;
  }
  
  const num = Number(cellValue);
  if (isNaN(num)) return null;
  if (num < 1 || num > 10) {
    console.warn(`Score ${num} is outside valid range [1, 10], skipping.`);
    return null;
  }
  return num;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const filePathArg = args.find(a => !a.startsWith('--'));

  if (!filePathArg) {
    console.error('Error: Please provide the path to the Excel file.');
    console.error('Usage: npx tsx import-excel.ts [--dry-run] <path-to-excel-file>');
    process.exit(1);
  }

  const filePath = path.resolve(filePathArg);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    process.exit(1);
  }

  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const dbName = process.env.COSMOS_DATABASE ?? 'whiskyapp';

  if (!isDryRun && (!endpoint || !key)) {
    console.error('Error: COSMOS_ENDPOINT and COSMOS_KEY environment variables are required for real runs.');
    process.exit(1);
  }

  let db: any = null;
  if (!isDryRun) {
    const client = new CosmosClient({ endpoint: endpoint!, key: key! });
    db = client.database(dbName);
    console.log(`Connected to Cosmos DB database: ${dbName}`);
  }

  console.log(`Reading Excel file: ${filePath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    console.error('Error: No worksheets found in the Excel file.');
    process.exit(1);
  }

  // Parse headers
  const headerRow = worksheet.getRow(1);
  const raters: { col: number; userId: string; userName: string }[] = [];
  
  headerRow.eachCell((cell, colNumber) => {
    if (colNumber > 4) {
      const val = cell.value?.toString().trim();
      if (val) {
        raters.push({ col: colNumber, userId: val, userName: val });
      }
    }
  });

  console.log(`Found ${raters.length} raters in columns 5+`);

  // In-memory collections built from Excel
  const parsedEvents = new Map<string, { name: string; location: string; date: string; whiskeys: Set<string> }>();
  const parsedWhiskeys = new Map<string, { name: string }>();
  const parsedRatings: { eventKey: string; whiskeyKey: string; userId: string; userName: string; score: number }[] = [];

  const nowIso = new Date().toISOString();

  // Iterate rows to populate parsed data
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const eventName = row.getCell(1).value?.toString().trim();
    const eventLocation = row.getCell(2).value?.toString().trim() || '';
    const eventDate = parseDateCell(row.getCell(3).value);
    const whiskeyName = row.getCell(4).value?.toString().trim();

    if (!eventName || !eventDate || !whiskeyName) {
      console.warn(`Row ${rowNumber} is missing required fields (event name, date, or whiskey name). Skipping.`);
      return;
    }

    const eventKey = `${eventName.toLowerCase()}|${eventDate}`;
    const whiskeyKey = whiskeyName.toLowerCase();

    if (!parsedEvents.has(eventKey)) {
      parsedEvents.set(eventKey, { name: eventName, location: eventLocation, date: eventDate, whiskeys: new Set() });
    }
    parsedEvents.get(eventKey)!.whiskeys.add(whiskeyKey);

    if (!parsedWhiskeys.has(whiskeyKey)) {
      parsedWhiskeys.set(whiskeyKey, { name: whiskeyName });
    }

    for (const rater of raters) {
      const score = parseScoreCell(row.getCell(rater.col).value);
      if (score !== null) {
        parsedRatings.push({
          eventKey,
          whiskeyKey,
          userId: rater.userId,
          userName: rater.userName,
          score
        });
      }
    }
  });

  // Calculate aggregates in memory
  // 1. global aggregates for each whiskey
  const whiskeyAggregates = new Map<string, { sum: number; count: number }>();
  // 2. event-whiskey aggregates
  const eventWhiskeyAggregates = new Map<string, { sum: number; count: number }>();

  for (const r of parsedRatings) {
    // Global
    if (!whiskeyAggregates.has(r.whiskeyKey)) {
      whiskeyAggregates.set(r.whiskeyKey, { sum: 0, count: 0 });
    }
    const wAgg = whiskeyAggregates.get(r.whiskeyKey)!;
    wAgg.sum += r.score;
    wAgg.count++;

    // Event-scoped
    const ewKey = `${r.eventKey}|${r.whiskeyKey}`;
    if (!eventWhiskeyAggregates.has(ewKey)) {
      eventWhiskeyAggregates.set(ewKey, { sum: 0, count: 0 });
    }
    const ewAgg = eventWhiskeyAggregates.get(ewKey)!;
    ewAgg.sum += r.score;
    ewAgg.count++;
  }

  // Mappings to real IDs
  const eventIdMap = new Map<string, string>();
  const whiskeyIdMap = new Map<string, string>();

  // --- Write / Prepare Events ---
  const eventsToCreate: EventDoc[] = [];
  for (const [eventKey, data] of parsedEvents.entries()) {
    let existingId: string | null = null;
    
    if (!isDryRun) {
      const { resources } = await db.container('events').items.query({
        query: 'SELECT * FROM c WHERE LOWER(c.name) = @name AND c.date = @date',
        parameters: [
          { name: '@name', value: data.name.toLowerCase() },
          { name: '@date', value: data.date }
        ]
      }).fetchAll();
      if (resources.length > 0) {
        existingId = resources[0].id;
        console.log(`Event "${data.name}" (${data.date}) already exists. Using existing ID.`);
      }
    }

    if (existingId) {
      eventIdMap.set(eventKey, existingId);
    } else {
      const newId = uuidv4();
      eventIdMap.set(eventKey, newId);
      
      const doc: EventDoc = {
        id: newId,
        name: data.name,
        description: '',
        date: data.date,
        location: data.location,
        createdBy: 'import-script',
        createdByUserId: 'import-script',
        createdAt: nowIso,
        updatedAt: nowIso,
        whiskeyCount: data.whiskeys.size
      };
      eventsToCreate.push(doc);
    }
  }

  // --- Write / Prepare Whiskeys ---
  const whiskeysToCreate: WhiskeyDoc[] = [];
  for (const [whiskeyKey, data] of parsedWhiskeys.entries()) {
    let existingId: string | null = null;

    if (!isDryRun) {
      const { resources } = await db.container('whiskeys').items.query({
        query: 'SELECT * FROM c WHERE LOWER(c.name) = @name',
        parameters: [{ name: '@name', value: data.name.toLowerCase() }]
      }).fetchAll();
      if (resources.length > 0) {
        existingId = resources[0].id;
        console.log(`Whiskey "${data.name}" already exists. Using existing ID.`);
      }
    }

    if (existingId) {
      whiskeyIdMap.set(whiskeyKey, existingId);
    } else {
      const newId = uuidv4();
      whiskeyIdMap.set(whiskeyKey, newId);

      const agg = whiskeyAggregates.get(whiskeyKey) || { sum: 0, count: 0 };
      const avg = agg.count > 0 ? roundToOneDecimal(agg.sum / agg.count) : 0;

      const doc: WhiskeyDoc = {
        id: newId,
        name: data.name,
        createdBy: 'import-script',
        createdByUserId: 'import-script',
        createdAt: nowIso,
        updatedAt: nowIso,
        globalAverageRating: avg,
        globalRatingCount: agg.count
      };
      whiskeysToCreate.push(doc);
    }
  }

  // --- Write / Prepare EventWhiskeys ---
  const eventWhiskeysToCreate: EventWhiskeyDoc[] = [];
  for (const [eventKey, eventData] of parsedEvents.entries()) {
    const eventId = eventIdMap.get(eventKey)!;
    
    for (const whiskeyKey of eventData.whiskeys) {
      const whiskeyId = whiskeyIdMap.get(whiskeyKey)!;
      let existingId: string | null = null;

      if (!isDryRun) {
        const { resources } = await db.container('eventWhiskeys').items.query({
          query: 'SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId',
          parameters: [
            { name: '@eventId', value: eventId },
            { name: '@whiskeyId', value: whiskeyId }
          ]
        }).fetchAll();
        if (resources.length > 0) {
          existingId = resources[0].id;
        }
      }

      if (!existingId) {
        const ewKey = `${eventKey}|${whiskeyKey}`;
        const agg = eventWhiskeyAggregates.get(ewKey) || { sum: 0, count: 0 };
        const avg = agg.count > 0 ? roundToOneDecimal(agg.sum / agg.count) : 0;

        const doc: EventWhiskeyDoc = {
          id: uuidv4(),
          eventId,
          whiskeyId,
          addedBy: 'import-script',
          addedByUserId: 'import-script',
          createdAt: nowIso,
          averageRating: avg,
          ratingCount: agg.count
        };
        eventWhiskeysToCreate.push(doc);
      }
    }
  }

  // --- Write / Prepare Ratings ---
  const ratingsToCreate: RatingDoc[] = [];
  for (const r of parsedRatings) {
    const eventId = eventIdMap.get(r.eventKey)!;
    const whiskeyId = whiskeyIdMap.get(r.whiskeyKey)!;

    let existingId: string | null = null;
    if (!isDryRun) {
      const { resources } = await db.container('ratings').items.query({
        query: 'SELECT * FROM c WHERE c.eventId = @eventId AND c.whiskeyId = @whiskeyId AND c.userId = @userId',
        parameters: [
          { name: '@eventId', value: eventId },
          { name: '@whiskeyId', value: whiskeyId },
          { name: '@userId', value: r.userId }
        ]
      }).fetchAll();
      if (resources.length > 0) {
        existingId = resources[0].id;
      }
    }

    if (!existingId) {
      const doc: RatingDoc = {
        id: uuidv4(),
        eventId,
        whiskeyId,
        userId: r.userId,
        userName: r.userName,
        score: r.score,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      ratingsToCreate.push(doc);
    }
  }

  if (isDryRun) {
    console.log('\n--- DRY RUN SUMMARY ---');
    console.log(`Would create ${eventsToCreate.length} new events.`);
    console.log(`Would create ${whiskeysToCreate.length} new whiskeys.`);
    console.log(`Would create ${eventWhiskeysToCreate.length} new event-whiskey links.`);
    console.log(`Would create ${ratingsToCreate.length} new ratings.`);
    console.log('\nSample Events:', JSON.stringify(eventsToCreate.slice(0, 2), null, 2));
    console.log('\nSample Whiskeys:', JSON.stringify(whiskeysToCreate.slice(0, 2), null, 2));
    console.log('\nSample EventWhiskeys:', JSON.stringify(eventWhiskeysToCreate.slice(0, 2), null, 2));
    console.log('\nSample Ratings:', JSON.stringify(ratingsToCreate.slice(0, 2), null, 2));
  } else {
    console.log(`\nWriting to Cosmos DB...`);
    
    let createdEvents = 0;
    for (const doc of eventsToCreate) {
      try {
        await db.container('events').items.create(doc);
        createdEvents++;
      } catch (err: any) {
        if (err.code === 409) {
          console.warn(`Event ${doc.id} already exists (409 conflict). Skipping.`);
        } else {
          console.error(`Failed to create event ${doc.id}:`, err.message);
        }
      }
    }
    console.log(`Created ${createdEvents} events.`);

    let createdWhiskeys = 0;
    for (const doc of whiskeysToCreate) {
      try {
        await db.container('whiskeys').items.create(doc);
        createdWhiskeys++;
      } catch (err: any) {
        if (err.code === 409) {
          console.warn(`Whiskey ${doc.id} already exists (409 conflict). Skipping.`);
        } else {
          console.error(`Failed to create whiskey ${doc.id}:`, err.message);
        }
      }
    }
    console.log(`Created ${createdWhiskeys} whiskeys.`);

    let createdLinks = 0;
    for (const doc of eventWhiskeysToCreate) {
      try {
        await db.container('eventWhiskeys').items.create(doc);
        createdLinks++;
      } catch (err: any) {
        if (err.code === 409) {
          console.warn(`EventWhiskey link ${doc.id} already exists (409 conflict). Skipping.`);
        } else {
          console.error(`Failed to create eventWhiskey link ${doc.id}:`, err.message);
        }
      }
    }
    console.log(`Created ${createdLinks} eventWhiskey links.`);

    let createdRatings = 0;
    for (const doc of ratingsToCreate) {
      try {
        await db.container('ratings').items.create(doc);
        createdRatings++;
      } catch (err: any) {
        if (err.code === 409) {
          console.warn(`Rating ${doc.id} already exists (409 conflict). Skipping.`);
        } else {
          console.error(`Failed to create rating ${doc.id}:`, err.message);
        }
      }
    }
    console.log(`Created ${createdRatings} ratings.`);
  }

  console.log('Done!');
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
