import { Inject, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRolesMapping } from '../entities/UserRoleMapping.entity';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PermissionsService {
  
  constructor(
    @InjectRepository(UserRolesMapping)
    private readonly userRolesMapping: Repository<UserRolesMapping>,
    @Inject(CACHE_MANAGER) private cacheService: Cache,
    private configService : ConfigService
  ) {}

  async getUserPrivilegesAndRoles(userId: string) {
    const query = `SELECT "UserRolesMapping"."userId", "UserRolesMapping"."roleId", "UserRolesMapping"."tenantId" AS tenant_id,
                  "RolePrivilegesMapping"."privilegeId", "Privileges"."name" AS privilege_name, "Privileges"."code" AS privilege_code,
                  "Roles"."code" AS Role_code, "Roles"."name" AS Role_name
                  FROM "UserRolesMapping"
                  LEFT JOIN "RolePrivilegesMapping" ON "RolePrivilegesMapping"."roleId"="UserRolesMapping"."roleId"
                  LEFT JOIN "Privileges" ON "Privileges"."privilegeId" = "RolePrivilegesMapping"."privilegeId"
                  LEFT JOIN "Roles" ON "Roles"."roleId" = "UserRolesMapping"."roleId"
                  WHERE "UserRolesMapping"."userId" = $1`;
    const result = await this.userRolesMapping.query(query, [userId]);
    
    if (!result.length) {
      return [];
    }
    let privilegesPerTenant = [];
    // If role is 'admin' then add 'all' to privilege
    privilegesPerTenant = result.reduce(
      (acc, { privilege_code, role_code, tenant_id }) => {
        if (role_code === 'admin') {
          acc[tenant_id] = ['all'];
        } else if (acc[tenant_id]) {
          acc[tenant_id].push(privilege_code);
        } else {
          acc[tenant_id] = [privilege_code];
        }
        return acc;
      },
      {},
    );
    let rolesPerTenant = [];
    rolesPerTenant = result.reduce(
      (acc, { role_code, tenant_id }) => {
        if (acc[tenant_id]) {
          if(!acc[tenant_id].includes(role_code))
              acc[tenant_id].push(role_code);
        } else {
          acc[tenant_id] = [role_code];
        }
        return acc;
      },
      {},
    );
    return {
      privileges : privilegesPerTenant,
      roles : rolesPerTenant
    };
  }

  async getUserPrivilegesForTenant(userId: string,tenantId: string) {
    const cachedData:any = await this.cacheService.get(userId);
      if (!cachedData) {
        const userPrivilegesAndRoles = await this.getUserPrivilegesAndRoles(userId)
        await this.cacheService.set(userId, userPrivilegesAndRoles, this.configService.get('TTL'));
        return cachedData.privileges[tenantId]
      } else {
        return cachedData.privileges[tenantId]
      }
  }  
  async getUserRolesForTenant(userId: string,tenantId: string) {
    const cachedData:any = await this.cacheService.get(userId);
      if (!cachedData) {
        const userPrivilegesAndRoles = await this.getUserPrivilegesAndRoles(userId)
        await this.cacheService.set(userId, userPrivilegesAndRoles, );
      } else {
        return cachedData.roles[tenantId]
      }
  }
}
