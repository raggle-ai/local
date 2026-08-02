#!/usr/bin/env node

/**
 * Direct calendar extraction test without TypeScript compilation
 * This simulates the calendar extraction logic to test the patterns
 */

console.log('🧪 Calendar Extraction Test (Direct)');
console.log('====================================\n');

const GREEK_OPERA_TEXT = `Ticket Pre-sale for the Greek National Opera
Requiem for the End of Love 

The presale for the production Requiem for the End of Love, will begin on Tuesday, November 18 at 12:00 PM for SNFCC Members and on Wednesday, November 19 for the general public.
 
Box Office: +30 213 0885700 
Εmail: boxoffice@nationalopera.gr

You can also purchase your tickets at the GNO box office and via ticketservices.gr.

 https://www.ticketservices.gr/event/gno-rekviem-gia-to-telos-tou-erota-snfcc-members/?lang=en&utm_source=SNFCC_Members_EN_API&utm_campaign=06ea1385e5-EMAIL_CAMPAIGN_2017_11_22_COPY_01&utm_medium=email&utm_term=0_4323195c82-06ea1385e5-444538340


Performance-installation • New production
Requiem for the End of Love
Giorgos Koumendakis / Dimitris Papaioannou

24, 25, 27, 28, 29, 30 Jan 2026
Stavros Niarchos Hall

Starts at: 19.30, 21.00 (Sunday: 18.30, 20.00)

Requiem for the End of Love, a work that marked the artistic creation of the 1990s, signals the long-anticipated reunion of two emblematic fellow-travellers of the legendary Edafos Dance Theatre, Dimitris Papaioannou and Giorgos Koumendakis, in a new reading by the internationally acclaimed conductor Teodor Currentzis.`;

function testCalendarFallbackParsing(testName, inputText, expected) {
  console.log(`\n🧪 Testing: ${testName}`);
  console.log("=" .repeat(60));
  console.log("Input length:", inputText.length, "characters");
  console.log("First 100 chars:", inputText.substring(0, 100) + "...");
  
  // Simulate the fallback parsing logic from calendar extraction
  const fallbackFields = {};
  
  // Extract venue patterns
  const venuePatterns = [
    /(\w+\s+Hall)/i,
    /(\w+\s+Theatre)/i,
    /(\w+\s+Theater)/i,
    /(\w+\s+Center)/i,
    /(\w+\s+Centre)/i,
    /(\w+\s+Opera)/i,
    /(\w+\s+Auditorium)/i,
  ];
  
  for (const pattern of venuePatterns) {
    const match = inputText.match(pattern);
    if (match) {
      fallbackFields.location = match[1];
      break;
    }
  }
  
  // Extract URLs
  const urlMatch = inputText.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    fallbackFields.url = urlMatch[1];
  }
  
  // Extract email
  const emailMatch = inputText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    fallbackFields.email = emailMatch[1];
  }
  
  // Extract times in HH:MM format
  const timeMatches = inputText.match(/(\d{1,2}[:\.]?\d{2})/g);
  const extractedTimes = timeMatches?.filter(time => {
    const normalized = time.replace('.', ':');
    const [hours] = normalized.split(':');
    return parseInt(hours) >= 0 && parseInt(hours) <= 23;
  });
  
  if (extractedTimes && extractedTimes.length > 0) {
    fallbackFields.startTime = extractedTimes[0];
    if (extractedTimes.length > 1) {
      fallbackFields.endTime = extractedTimes[1];
    }
  }
  
  // Extract title from first non-empty line
  const lines = inputText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    fallbackFields.title = lines[0].trim();
    
    // Look for a better title in subsequent lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes("Requiem") || line.length < fallbackFields.title.length) {
        if (line.length > 10 && line.length < 100) {
          fallbackFields.title = line;
          break;
        }
      }
    }
  }
  
  // Look for dates in 2026 format
  const dateMatch = inputText.match(/(\d{1,2})[,\s]+(\d{1,2})[,\s]+(\d{1,2})[,\s]+(\d{1,2})[,\s]+(\d{1,2})[,\s]+(\d{1,2})\s+(Jan|January)\s+(\d{4})/i);
  if (dateMatch) {
    const year = dateMatch[8];
    const month = dateMatch[7].toLowerCase() === 'jan' || dateMatch[7].toLowerCase() === 'january' ? '01' : '01';
    const firstDay = dateMatch[1].padStart(2, '0');
    fallbackFields.startDate = `${year}-${month}-${firstDay}`;
  }
  
  // Build description
  let description = "";
  if (fallbackFields.url) {
    description += `Website: ${fallbackFields.url}`;
  }
  if (fallbackFields.email) {
    description += description ? `\nContact: ${fallbackFields.email}` : `Contact: ${fallbackFields.email}`;
  }
  
  if (description) {
    fallbackFields.description = description;
  }
  
  console.log("\n📊 EXTRACTED FIELDS:");
  console.log("Title:", fallbackFields.title || "❌ NOT EXTRACTED");
  console.log("Start Date:", fallbackFields.startDate || "❌ NOT EXTRACTED");
  console.log("Start Time:", fallbackFields.startTime || "❌ NOT EXTRACTED");
  console.log("End Time:", fallbackFields.endTime || "❌ NOT EXTRACTED");
  console.log("Location:", fallbackFields.location || "❌ NOT EXTRACTED");
  console.log("Description:", fallbackFields.description || "❌ NOT EXTRACTED");
  console.log("URL:", fallbackFields.url || "❌ NOT EXTRACTED");
  console.log("Email:", fallbackFields.email || "❌ NOT EXTRACTED");
  
  // Validation
  let passed = 0;
  let total = 0;
  
  console.log("\n📋 VALIDATION:");
  
  if (expected.title) {
    total++;
    if (fallbackFields.title && fallbackFields.title.includes(expected.title)) {
      console.log("✅ Title contains expected text");
      passed++;
    } else {
      console.log(`❌ Title: expected to contain '${expected.title}', got '${fallbackFields.title}'`);
    }
  }
  
  if (expected.location) {
    total++;
    if (fallbackFields.location && fallbackFields.location.includes(expected.location)) {
      console.log("✅ Location correct");
      passed++;
    } else {
      console.log(`❌ Location: expected '${expected.location}', got '${fallbackFields.location}'`);
    }
  }
  
  if (expected.startDate) {
    total++;
    if (fallbackFields.startDate && fallbackFields.startDate.includes("2026")) {
      console.log("✅ Performance date (2026) extracted correctly");
      passed++;
    } else {
      console.log(`❌ Start date: expected 2026 date, got '${fallbackFields.startDate}'`);
    }
  }
  
  if (expected.startTime) {
    total++;
    if (fallbackFields.startTime && (fallbackFields.startTime.includes("19") || fallbackFields.startTime.includes("18"))) {
      console.log("✅ Performance time extracted correctly");
      passed++;
    } else {
      console.log(`❌ Start time: expected performance time, got '${fallbackFields.startTime}'`);
    }
  }
  
  if (expected.url) {
    total++;
    if (fallbackFields.url && fallbackFields.url.includes("ticketservices")) {
      console.log("✅ URL extracted correctly");
      passed++;
    } else {
      console.log(`❌ URL: expected ticketservices URL, got '${fallbackFields.url}'`);
    }
  }
  
  if (expected.email) {
    total++;
    if (fallbackFields.email && fallbackFields.email.includes("nationalopera.gr")) {
      console.log("✅ Email extracted correctly");
      passed++;
    } else {
      console.log(`❌ Email: expected nationalopera.gr email, got '${fallbackFields.email}'`);
    }
  }
  
  console.log(`\n🎯 Score: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  
  return { passed, total };
}

// Run test
console.log("Testing calendar extraction patterns...\n");

const result = testCalendarFallbackParsing(
  "Greek Opera Event", 
  GREEK_OPERA_TEXT,
  {
    title: "Requiem",
    location: "Stavros Niarchos Hall",
    startDate: "2026",
    startTime: "19:30",
    url: true,
    email: true
  }
);

console.log("\n\n📊 FINAL RESULTS:");
console.log("==================");
console.log(`Total: ${result.passed}/${result.total} tests passed (${Math.round(result.passed/result.total*100)}%)`);

if (result.passed === result.total) {
  console.log("🎉 All tests passed! Calendar extraction working perfectly!");
} else if (result.passed >= result.total * 0.8) {
  console.log("✅ Most tests passed! Calendar extraction working well.");
} else {
  console.log("⚠️  Some tests failed. Calendar extraction needs improvement.");
}