declare global {
  enum UserRole {
    "TEACHER" = "TEACHER",
    "STUDENT" = "STUDENT",
  }
  enum PermissionLevel {
    "READ" = 4,
    "WRITE" = 6,
    "EXECUTE" = 7,
  }
}

export {};
