export const hasPerm = (user, perm) => {
  const perms = user?.perms;
  if (!Array.isArray(perms)) return false;
  return perms.includes('*') || perms.includes(perm);
};
