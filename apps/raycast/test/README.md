# AI Extraction Tests

This directory contains legacy extraction experiments plus the current contact test helpers.

## Test Files

### Core Test Files

- `run-contact-test.js` - Live Raycast AI contact harness for manual verification
- `../scripts/test-contact-unit.js` - Deterministic contact unit tests with mocked extraction

### Test Runners

- `run-test.js` - Main supported test runner for contact extraction
- `run-all-tests.js` - Simple supported runner for contact extraction
- `run-contact-test.js` - Manual live Raycast AI contact testing
- `run-calendar-test.js` - Direct calendar pattern testing

## Contact Test Modes

- `npm run test:contact-unit`

  - Recommended default
  - Deterministic and headless
  - Covers prompt construction, name fallback, payload mapping, and website normalization

- `node test/run-contact-test.js`
  - Manual integration harness
  - Uses live Raycast AI calls
  - May block or fail outside a full Raycast environment

## Running Tests

### All Tests

```bash
node test/run-all-tests.js
```

### Supported Runner

```bash
node test/run-test.js contact     # Deterministic contact tests only
node test/run-test.js             # Same deterministic contact coverage
```

### Contact Tests

```bash
npm run test:contact-unit         # Deterministic contact unit tests
node test/run-contact-test.js     # Manual live Raycast AI checks
```

## Troubleshooting

### Common Issues:

1. **Raycast AI not available**: Tests require Raycast Pro subscription
2. **TypeScript compilation errors**: Run from project root directory
3. **Live contact harness hangs**: Use `npm run test:contact-unit` for deterministic coverage
