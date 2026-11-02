// Human-readable messages for named database constraints.
// The constraint is still enforced by PostgreSQL; this only explains it to the user.
const MESSAGES: Record<string, string> = {
  uq_users_email: "An account with this email already exists",
  ck_users_email_format: "Please enter a valid email address",
  ck_users_name: "Name must be at least 2 characters",
  ck_users_role: "Role must be researcher or admin",
  ck_users_password_is_bcrypt: "Passwords must be stored as bcrypt hashes",
};

export function constraintMessage(constraint: string): string | undefined {
  return MESSAGES[constraint];
}

/** Let feature modules register messages for their own constraints. */
export function registerConstraintMessages(messages: Record<string, string>): void {
  Object.assign(MESSAGES, messages);
}
