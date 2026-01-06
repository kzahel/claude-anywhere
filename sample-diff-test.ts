// Sample file for testing diff visualization
// This file demonstrates various edit types

interface UserConfig {
  name: string;
  email: string;
  age: number;
  isActive: boolean;
  preferences: {
    theme: "light" | "dark";
    notifications: boolean;
    language: string;
  };
}

function validateUser(user: UserConfig): boolean {
  // Validate name field
  if (!user.name || user.name.length < 3) {
    logger.warn("Bad name provided");
    return false;
  }

  // Validate email address
  if (!user.email || !user.email.includes("@") || !user.email.includes(".")) {
    logger.warn("Bad email provided");
    return false;
  }

  // Check age range
  if (user.age < 0 || user.age > 150) {
    console.log("Invalid age provided");
    return false;
  }

  // All validations passed
  console.log("User validation successful");
  return true;
}

function createDefaultUser(): UserConfig {
  return {
    name: "Anonymous",
    email: "anonymous@example.com",
    age: 0,
    isActive: false,
    preferences: {
      theme: "light",
      notifications: true,
      language: "en",
    },
  };
}

export { validateUser, createDefaultUser, type UserConfig };
