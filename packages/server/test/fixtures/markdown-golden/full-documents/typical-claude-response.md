I'll help you create a function to validate email addresses. Here's a solution:

## Implementation

```typescript
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
```

## How it works

The regex pattern checks for:

- One or more characters that aren't spaces or `@` symbols
- An `@` symbol
- One or more characters for the domain name
- A `.` followed by the extension

## Usage

```typescript
isValidEmail("user@example.com");  // true
isValidEmail("invalid-email");     // false
```

Let me know if you need any modifications!