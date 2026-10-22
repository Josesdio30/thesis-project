const ROLES = [[1, 'STUDENT'], [2, 'TEACHER'], [3, 'ADMIN']];
const MASTER = [
  ['ASSIGNMENT_TYPE', 'QUIZ'], ['ASSIGNMENT_TYPE', 'ESSAY'],
  ['QUESTION_TYPE', 'MULTIPLE CHOICE'], ['QUESTION_TYPE', 'TRUE FALSE'],
  ['QUESTION_TYPE', 'ESSAY'], ['QUESTION_TYPE', 'FILE_UPLOAD'],
  ['SUBMISSION_STATUS', 'IN PROGRESS'], ['SUBMISSION_STATUS', 'SUBMITTED'],
  ['SUBMISSION_STATUS', 'PARTIALLY GRADED'], ['SUBMISSION_STATUS', 'GRADED'],
];

export function validateBootstrapInput(input) {
  for (const [field, max] of [['username', 50], ['email', 100], ['name', 255], ['code', 100]]) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > max) {
      throw new Error(`Invalid ${field} (required, max ${max} characters)`);
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error('Invalid email');
  if (typeof input.password !== 'string' || input.password.length < 12 || Buffer.byteLength(input.password, 'utf8') > 72) {
    throw new Error('Password must contain at least 12 characters and at most 72 UTF-8 bytes');
  }
  return input;
}

/** Caller owns the connection. All seed and account writes are atomic; no resets. */
export async function bootstrapDatabase(client, input, passwordHash) {
  await client.query('BEGIN');
  try {
    // Serialize bootstrap attempts. Existing incompatible role IDs must never be renamed.
    await client.query('SELECT pg_advisory_xact_lock(7301217)');
    const { rows: existingRoles } = await client.query(
      "SELECT id, category, name, is_active FROM enumeration WHERE id IN (1,2,3) OR (category = 'ROLE' AND name IN ('STUDENT','TEACHER','ADMIN'))"
    );
    for (const [id, name] of ROLES) {
      if (existingRoles.some(row => (row.id === id || (row.category === 'ROLE' && row.name === name)) &&
          (row.id !== id || row.category !== 'ROLE' || row.name !== name || !row.is_active))) {
        throw new Error('Incompatible role mapping: require active STUDENT=1, TEACHER=2, ADMIN=3; no data changed');
      }
    }
    for (const [id, name] of ROLES) {
      await client.query("INSERT INTO enumeration (id, category, name, is_active) VALUES ($1, 'ROLE', $2, true) ON CONFLICT (name, category) DO NOTHING", [id, name]);
    }
    // Never rewind an existing sequence, including gaps from rolled-back transactions.
    const { rows: [{ sequence_name: sequenceName }] } = await client.query("SELECT pg_get_serial_sequence('enumeration','id') AS sequence_name");
    await client.query('SELECT setval($1::regclass, GREATEST((SELECT COALESCE(MAX(id), 1) FROM enumeration), nextval($1::regclass)), true)', [sequenceName]);
    for (const [category, name] of MASTER) {
      await client.query('INSERT INTO enumeration (category, name, is_active) VALUES ($1,$2,true) ON CONFLICT (name, category) DO NOTHING', [category, name]);
      const { rows: [row] } = await client.query('SELECT is_active FROM enumeration WHERE category=$1 AND name=$2', [category, name]);
      if (!row?.is_active) throw new Error('Required master data is inactive; review it before bootstrap');
    }

    const { rows: users } = await client.query('SELECT id, email, user_name, is_active, is_deleted FROM app_user WHERE user_name = $1 OR email = $2', [input.username, input.email]);
    if (users.length) {
      const user = users[0];
      const { rows: roles } = await client.query('SELECT role_id, is_active FROM app_user_role WHERE user_id = $1', [user.id]);
      const { rows: details } = await client.query('SELECT kode_admin FROM admin_details WHERE user_id = $1', [user.id]);
      if (users.length !== 1 || user.user_name !== input.username || user.email !== input.email || !user.is_active || user.is_deleted ||
          roles.length !== 1 || roles[0].role_id !== 3 || !roles[0].is_active || details.length !== 1 || details[0].kode_admin !== input.code) {
        throw new Error('Existing account conflicts with requested admin; no account or password was overwritten');
      }
      await client.query('COMMIT');
      return { created: false, userId: user.id };
    }
    const { rows: [user] } = await client.query(
      'INSERT INTO app_user (email,password,user_name,nama_lengkap,is_active,is_deleted) VALUES ($1,$2,$3,$4,true,false) RETURNING id',
      [input.email, passwordHash, input.username, input.name]
    );
    await client.query('INSERT INTO app_user_role (role_id,user_id,is_active) VALUES (3,$1,true)', [user.id]);
    await client.query('INSERT INTO admin_details (user_id,kode_admin) VALUES ($1,$2)', [user.id, input.code]);
    await client.query('COMMIT');
    return { created: true, userId: user.id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
