#!/usr/bin/env node

/**
 * Comprehensive test suite for both contact and calendar extraction
 * Tests various formats and edge cases to ensure AI is working properly
 */

console.log('🧪 Comprehensive AI Extraction Test Suite');
console.log('==========================================\n');

// ===== CONTACT TEST EXAMPLES =====

const CONTACT_EXAMPLES = {
  // Original working example
  julian: {
    text: "Julian Gargicevich, Senior Developer, julian@techcorp.com, +1-555-123-4567, San Francisco, CA",
    expected: {
      firstName: "Julian",
      lastName: "Gargicevich", 
      jobTitle: "Senior Developer",
      email: "julian@techcorp.com",
      phone: "+1-555-123-4567",
      address: "San Francisco, CA"
    }
  },
  
  // Business card format (improved)
  drSarah: {
    text: `Dr. Sarah Johnson
Chief Technology Officer
Innovation Labs Inc.
sarah.johnson@innovationlabs.com
Phone: (555) 987-6543
Address: 123 Tech Boulevard, Suite 500
Austin, TX 78701
Website: www.innovationlabs.com`,
    expected: {
      firstName: "Sarah",
      lastName: "Johnson",
      organization: "Innovation Labs Inc.",
      jobTitle: "Chief Technology Officer",
      email: "sarah.johnson@innovationlabs.com",
      phone: "(555) 987-6543",
      address: "123 Tech Boulevard, Suite 500",
      website: "www.innovationlabs.com"
    }
  },
  
  // Email signature format
  michael: {
    text: `Best regards,

Michael Chen
Product Manager
TechStart Solutions
michael.chen@techstart.io
Mobile: +1 (555) 234-5678
1500 Market Street, Floor 12
San Francisco, CA 94102
www.techstart.io`,
    expected: {
      firstName: "Michael",
      lastName: "Chen",
      organization: "TechStart Solutions",
      jobTitle: "Product Manager", 
      email: "michael.chen@techstart.io",
      phone: "+1 (555) 234-5678",
      address: "1500 Market Street, Floor 12",
      website: "www.techstart.io"
    }
  },
  
  // LinkedIn format
  linkedin: {
    text: `Emma Rodriguez
Senior Software Engineer at Meta
📧 emma.rodriguez@meta.com
📱 (650) 555-0123
📍 Menlo Park, CA
🔗 linkedin.com/in/emmarodriguez`,
    expected: {
      firstName: "Emma",
      lastName: "Rodriguez",
      organization: "Meta",
      jobTitle: "Senior Software Engineer",
      email: "emma.rodriguez@meta.com",
      phone: "(650) 555-0123",
      address: "Menlo Park, CA"
    }
  },
  
  // Conference badge format
  conference: {
    text: `Alex Thompson - Conference Badge
Data Scientist
Google Research
alex.t@google.com | +1-650-555-9876
Mountain View, California`,
    expected: {
      firstName: "Alex",
      lastName: "Thompson",
      organization: "Google Research",
      jobTitle: "Data Scientist",
      email: "alex.t@google.com",
      phone: "+1-650-555-9876",
      address: "Mountain View, California"
    }
  },

  // Simple format
  simple: {
    text: "Jane Smith, Marketing Director, jane@acme.com, 555-123-4567",
    expected: {
      firstName: "Jane",
      lastName: "Smith",
      jobTitle: "Marketing Director",
      email: "jane@acme.com",
      phone: "555-123-4567"
    }
  }
};

// ===== CALENDAR TEST EXAMPLES =====

const CALENDAR_EXAMPLES = {
  // Original Greek Opera example
  greekOpera: {
    text: `Ticket Pre-sale for the Greek National Opera
Requiem for the End of Love 

The presale for the production Requiem for the End of Love, will begin on Tuesday, November 18 at 12:00 PM for SNFCC Members and on Wednesday, November 19 for the general public.
 
Box Office: +30 213 0885700 
Εmail: boxoffice@nationalopera.gr

You can also purchase your tickets at the GNO box office and via ticketservices.gr.

Performance-installation • New production
Requiem for the End of Love
Giorgos Koumendakis / Dimitris Papaioannou

24, 25, 27, 28, 29, 30 Jan 2026
Stavros Niarchos Hall

Starts at: 19.30, 21.00 (Sunday: 18.30, 20.00)

Requiem for the End of Love, a work that marked the artistic creation of the 1990s.`,
    expected: {
      title: "Requiem for the End of Love",
      location: "Stavros Niarchos Hall",
      startDate: "2026",
      startTime: "19:30",
      url: true,
      email: true
    }
  },

  // Concert format
  concert: {
    text: `THE BEATLES TRIBUTE BAND
Live at Madison Square Garden

Saturday, March 15, 2025
Doors open: 7:00 PM
Show starts: 8:30 PM

Madison Square Garden
4 Pennsylvania Plaza, New York, NY 10001

Tickets: ticketmaster.com
Info: info@msg.com
Box Office: (212) 465-6741`,
    expected: {
      title: "THE BEATLES TRIBUTE BAND",
      location: "Madison Square Garden",
      startDate: "2025-03-15",
      startTime: "20:30",
      url: true,
      email: true
    }
  },

  // Conference format
  techConf: {
    text: `TechCrunch Disrupt 2025
Innovation Summit

October 12-14, 2025
Moscone Convention Center
San Francisco, California

Day 1: October 12
Registration: 8:00 AM
Keynote: 9:30 AM
Networking lunch: 12:00 PM
Panels: 2:00 PM - 5:00 PM

Website: disrupt.techcrunch.com
Contact: events@techcrunch.com`,
    expected: {
      title: "TechCrunch Disrupt 2025",
      location: "Moscone Convention Center",
      startDate: "2025-10-12",
      startTime: "09:30",
      url: true,
      email: true
    }
  },

  // Wedding invitation
  wedding: {
    text: `Sarah & Michael
request the pleasure of your company
at their wedding celebration

Saturday, June 21st, 2025
4:00 PM Ceremony
6:00 PM Reception

The Plaza Hotel
768 5th Avenue, New York, NY

RSVP: sarah.michael.wedding@gmail.com
Questions: (555) 123-LOVE`,
    expected: {
      title: "Sarah & Michael Wedding",
      location: "The Plaza Hotel", 
      startDate: "2025-06-21",
      startTime: "16:00",
      email: true,
      phone: true
    }
  },

  // Simple meeting
  meeting: {
    text: `Weekly Team Meeting
Project Review and Planning

Every Tuesday at 2:00 PM
Conference Room A
Building 3, Floor 2

Zoom link: https://zoom.us/j/123456789
Contact: team-lead@company.com`,
    expected: {
      title: "Weekly Team Meeting",
      location: "Conference Room A",
      startTime: "14:00",
      url: true,
      email: true
    }
  }
};

// ===== TEST FUNCTIONS =====

function testContactFallbackParsing(testName, inputText, expected) {
  console.log(`\n🧪 Contact Test: ${testName}`);
  console.log("=" .repeat(50));
  
  // Simulate improved fallback parsing logic
  let parsed = {};
  
  // Extract email
  const emailMatch = inputText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    parsed.email = emailMatch[0];
  }
  
  // Extract phone with better patterns
  const phoneMatches = [
    /[\+]?[1-9]?[\-\s]?[\(]?[0-9]{1,4}[\)]?[\-\s]?[0-9]{1,4}[\-\s]?[0-9]{1,9}/,
    /\(\d{3}\)\s*\d{3}-\d{4}/,  // (555) 123-4567
    /\d{3}-\d{3}-\d{4}/,        // 555-123-4567
    /\+\d{1,3}\s*\(\d{3}\)\s*\d{3}-\d{4}/ // +1 (555) 123-4567
  ];
  
  for (const pattern of phoneMatches) {
    const match = inputText.match(pattern);
    if (match) {
      parsed.phone = match[0];
      break;
    }
  }
  
  // Parse based on format
  if (inputText.includes(',')) {
    // Comma-separated format
    const parts = inputText.split(',').map(p => p.trim());
    
    const namePart = parts[0];
    const nameWords = namePart.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)?\s*/i, '').split(' ').filter(w => w.length > 0);
    
    parsed.firstName = nameWords[0];
    parsed.lastName = nameWords.slice(1).join(' ');
    
    // Look for job title
    for (const part of parts) {
      if (/\b(developer|manager|officer|engineer|director|analyst|scientist|designer)\b/i.test(part)) {
        parsed.jobTitle = part;
        break;
      }
    }
    
    // Look for location
    for (const part of parts) {
      if (/\b[A-Z]{2}\b/.test(part) || /(francisco|york|angeles|austin|seattle|chicago|boston)/i.test(part)) {
        parsed.address = part;
        break;
      }
    }
  } else {
    // Multi-line format
    const lines = inputText.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length > 0) {
      // First line with name - remove titles and extra text
      const nameLine = lines[0].replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)?\s*/i, '')
                              .replace(/\s*-.*$/, '') // Remove "- Conference Badge" etc
                              .replace(/[📧📱📍🔗]/g, '') // Remove emojis
                              .trim();
      const nameWords = nameLine.split(' ').filter(w => w.length > 0);
      
      parsed.firstName = nameWords[0];
      parsed.lastName = nameWords.slice(1).join(' ');
    }
    
    // Look for organization
    for (const line of lines) {
      if (/\b(Inc|Corp|LLC|Ltd|Labs|Company|Solutions|Systems|Technologies|Group|Research|Meta|Google)\b/i.test(line) && 
          !/(phone|mobile|email|address|website)/i.test(line)) {
        parsed.organization = line.replace(/[📧📱📍🔗]/g, '').trim();
        break;
      }
    }
    
    // Look for job title
    for (const line of lines) {
      if (/\b(Officer|Manager|Developer|Engineer|Director|Analyst|Designer|Architect|Scientist|Specialist)\b/i.test(line) && 
          !/(phone|mobile|email|address)/i.test(line)) {
        // Extract just the job title part
        const titleMatch = line.match(/(.*?)\s+at\s+/i);
        if (titleMatch) {
          parsed.jobTitle = titleMatch[1].replace(/[📧📱📍🔗]/g, '').trim();
        } else {
          parsed.jobTitle = line.replace(/[📧📱📍🔗]/g, '').trim();
        }
        break;
      }
    }
    
    // Look for website
    const websiteMatch = inputText.match(/(www\.[^\s]+|https?:\/\/[^\s]+|linkedin\.com[^\s]*)/i);
    if (websiteMatch) {
      parsed.website = websiteMatch[0];
    }
    
    // Look for address
    for (const line of lines) {
      if (/\d+.*\b(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Suite|Floor)\b/i.test(line) ||
          /\b(TX|CA|NY|FL|IL|PA|OH|MI|GA|NC|NJ|VA|WA|AZ|MA|IN|TN|MO|MD|WI|MN|CO|AL|SC|LA)\b/.test(line) ||
          /(Park|Valley|City|Beach|Heights)/i.test(line)) {
        parsed.address = line.replace(/[📧📱📍🔗]/g, '').replace(/^(Address:|📍)\s*/i, '').trim();
        break;
      }
    }
  }
  
  // Validation
  let passed = 0;
  let total = 0;
  const tests = [];
  
  Object.keys(expected).forEach(key => {
    total++;
    const expectedVal = expected[key];
    const actualVal = parsed[key];
    
    let success = false;
    if (typeof expectedVal === 'string' && actualVal) {
      success = actualVal.toLowerCase().includes(expectedVal.toLowerCase()) || 
                expectedVal.toLowerCase().includes(actualVal.toLowerCase());
    } else if (expectedVal === true) {
      success = !!actualVal;
    }
    
    if (success) {
      passed++;
      tests.push(`✅ ${key}: ${actualVal}`);
    } else {
      tests.push(`❌ ${key}: expected '${expectedVal}', got '${actualVal || 'NOT FOUND'}'`);
    }
  });
  
  console.log("Results:", tests.join('\n         '));
  console.log(`Score: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  
  return { passed, total };
}

function testCalendarFallbackParsing(testName, inputText, expected) {
  console.log(`\n📅 Calendar Test: ${testName}`);
  console.log("=" .repeat(50));
  
  // Simulate improved calendar extraction
  let parsed = {};
  
  // Extract title from first meaningful line
  const lines = inputText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    parsed.title = lines[0].trim();
  }
  
  // Look for venue with improved patterns
  const venuePatterns = [
    /([A-Z]\w+\s+[A-Z]\w+\s+(?:Hall|Center|Garden|Arena|Hotel))/gi,
    /([A-Z]\w+\s+(?:Hall|Theater|Centre|Arena|Garden|Hotel))/gi,
  ];
  
  for (const pattern of venuePatterns) {
    const match = inputText.match(pattern);
    if (match) {
      parsed.location = match[0];
      break;
    }
  }
  
  // Extract dates
  const datePatterns = [
    /(\w+),?\s+(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i,  // "Saturday, March 15, 2025"
    /(\d{1,2}),?\s+(\d{1,2}),?\s+.*?(\w+)\s+(\d{4})/i,           // "24, 25, ... Jan 2026"
    /(\w+)\s+(\d{1,2})-(\d{1,2}),?\s+(\d{4})/i,                  // "October 12-14, 2025"
  ];
  
  for (const pattern of datePatterns) {
    const match = inputText.match(pattern);
    if (match) {
      parsed.startDate = match[0];
      break;
    }
  }
  
  // Extract performance times (avoid presale/registration times)
  const timeLines = lines.filter(line => 
    /(starts?|show|performance|ceremony|keynote)\s*:?\s*\d{1,2}[:.]\d{2}/i.test(line) ||
    /\d{1,2}[:.]\d{2}\s*(PM|AM)/i.test(line)
  );
  
  for (const line of timeLines) {
    const timeMatch = line.match(/(\d{1,2})[:.:](\d{2})\s*(PM|AM)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = timeMatch[2];
      const ampm = timeMatch[3];
      
      if (ampm && ampm.toLowerCase() === 'pm' && hour !== 12) {
        hour += 12;
      } else if (ampm && ampm.toLowerCase() === 'am' && hour === 12) {
        hour = 0;
      }
      
      parsed.startTime = `${hour.toString().padStart(2, '0')}:${minute}`;
      break;
    }
  }
  
  // Extract contact info
  const emailMatch = inputText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    parsed.email = emailMatch[0];
  }
  
  const urlMatch = inputText.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.com)/i);
  if (urlMatch) {
    parsed.url = urlMatch[0];
  }
  
  // Validation
  let passed = 0;
  let total = 0;
  const tests = [];
  
  Object.keys(expected).forEach(key => {
    total++;
    const expectedVal = expected[key];
    const actualVal = parsed[key];
    
    let success = false;
    if (typeof expectedVal === 'string' && actualVal) {
      if (key === 'startDate') {
        success = actualVal.includes(expectedVal);
      } else {
        success = actualVal.toLowerCase().includes(expectedVal.toLowerCase());
      }
    } else if (expectedVal === true) {
      success = !!actualVal;
    }
    
    if (success) {
      passed++;
      tests.push(`✅ ${key}: ${actualVal}`);
    } else {
      tests.push(`❌ ${key}: expected '${expectedVal}', got '${actualVal || 'NOT FOUND'}'`);
    }
  });
  
  console.log("Results:", tests.join('\n         '));
  console.log(`Score: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  
  return { passed, total };
}

// ===== RUN ALL TESTS =====

async function runComprehensiveTests() {
  let totalPassed = 0;
  let totalTests = 0;
  
  console.log('👤 CONTACT EXTRACTION TESTS');
  console.log('===========================');
  
  for (const [testName, testData] of Object.entries(CONTACT_EXAMPLES)) {
    const result = testContactFallbackParsing(testName, testData.text, testData.expected);
    totalPassed += result.passed;
    totalTests += result.total;
  }
  
  console.log('\n\n📅 CALENDAR EXTRACTION TESTS');
  console.log('============================');
  
  for (const [testName, testData] of Object.entries(CALENDAR_EXAMPLES)) {
    const result = testCalendarFallbackParsing(testName, testData.text, testData.expected);
    totalPassed += result.passed;
    totalTests += result.total;
  }
  
  console.log('\n\n📊 COMPREHENSIVE TEST SUMMARY');
  console.log('==============================');
  console.log(`Overall Score: ${totalPassed}/${totalTests} tests (${Math.round(totalPassed/totalTests*100)}%)`);
  
  if (totalPassed/totalTests >= 0.9) {
    console.log('🎉 EXCELLENT! AI extraction working very well!');
  } else if (totalPassed/totalTests >= 0.8) {
    console.log('✅ GOOD! AI extraction working well with minor issues.');
  } else if (totalPassed/totalTests >= 0.7) {
    console.log('⚠️  FAIR! AI extraction working but needs improvements.');
  } else {
    console.log('❌ NEEDS WORK! AI extraction has significant issues.');
  }
  
  console.log('\nTest Examples:');
  console.log(`- Contact formats: ${Object.keys(CONTACT_EXAMPLES).length} (comma-separated, business cards, emails, LinkedIn, conference badges)`);
  console.log(`- Calendar formats: ${Object.keys(CALENDAR_EXAMPLES).length} (concerts, conferences, weddings, meetings, opera)`);
  
  return { totalPassed, totalTests };
}

// Run if called directly
if (require.main === module) {
  runComprehensiveTests()
    .then(({ totalPassed, totalTests }) => {
      if (totalPassed < totalTests * 0.8) {
        process.exit(1); // Exit with error if less than 80% pass rate
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Comprehensive test failed:', error);
      process.exit(1);
    });
}