import { readBearerClaims } from "@/app/api-services/utilities/bearer-token-verifier";
import { ApiServiceError, DatabaseConnectionError } from "@/app/api-services/exceptions";
import { getTenantPool } from "@/app/api-services/db/tenant-db.service";

type MasterUserRow = {
  id: number;
  name: string;
  user_type: string;
  shortname: string | null;
  login_access: string;
  phone: string | null;
  mobile: string | null;
  status: string;
  created_at: Date | null;
  updated_at: Date | null;
};

export async function listUsers(request: Request) {
  readBearerClaims(request);

  try {
    const pool = getTenantPool(request);
    const result = await pool.query<MasterUserRow>(
      `select id, name, user_type, shortname, login_access, phone, mobile, status, created_at, updated_at
       from users
       order by id`,
    );

    return {
      items: result.rows.map((user) => ({
        id: String(user.id),
        name: user.name,
        user_type: user.user_type,
        shortname: user.shortname,
        login_access: user.login_access,
        phone: user.phone,
        mobile: user.mobile,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at,
      })),
      total: result.rowCount ?? result.rows.length,
    };
  } catch (error) {
    if (error instanceof ApiServiceError) throw error;
    const detail = error instanceof Error ? error.message : "";
    throw new DatabaseConnectionError(
      detail.includes("does not exist")
        ? "users table was not found in tms_master"
        : "Unable to read users from the tenant database",
    );
  }
}
