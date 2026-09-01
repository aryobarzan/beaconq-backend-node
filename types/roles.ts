// Role and permission-level enums.
//
// These are used unqualified across the method modules (e.g. `UserRole.TEACHER`,
// `PermissionLevel.READ`), so they are registered on `globalThis` here in
// addition to being exported. The previous version of this file was
// `roles.d.ts` with ambient `declare global { enum UserRole {...} }` blocks:
// an ambient enum in a declaration file emits NO runtime code, so every
// `UserRole` / `PermissionLevel` reference in the compiled output threw
// `ReferenceError: UserRole is not defined` at request time.
//
// This module must be imported once for its side effects before any request is
// handled — see the first import in server.ts.

// (1) Real (non-ambient) enums. Because this is a `.ts` module and not a
// `.d.ts`, tsc emits runtime objects for these ({ TEACHER: 'TEACHER', ... }).
// They are exported too, so new code can `import { UserRole }` explicitly
// instead of relying on the global.
export enum UserRole {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
}

export enum PermissionLevel {
  READ = 4,
  WRITE = 6,
  EXECUTE = 7,
}

// (2) The *type* of each emitted enum object (the shape with `.TEACHER`,
// `.READ`, ... and their literal types). Used only to type the globals below.
type UserRoleEnum = typeof UserRole;
type PermissionLevelEnum = typeof PermissionLevel;

// (3) Type-checking half: declare the bare names in global scope so the
// unqualified `UserRole.TEACHER` references elsewhere compile without an
// import. This is what `roles.d.ts` used to provide. `var` (not let/const) is
// the declaration form that actually adds a member to the global type; the
// eslint-disable lines are only needed because the project bans `var`.
declare global {
  var UserRole: UserRoleEnum;

  var PermissionLevel: PermissionLevelEnum;
}

// (4) Runtime half: put the real enum objects on the global object so
// unqualified `UserRole` / `PermissionLevel` resolve at run time. This is the
// side effect that the old `.d.ts` structurally could not perform, and the
// reason server.ts imports this module for effect before anything uses it.
globalThis.UserRole = UserRole;
globalThis.PermissionLevel = PermissionLevel;
