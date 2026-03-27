import { 
  buildSQL, 
  buildBatchSql, 
  parseBatchResults, 
  buildBatchCountSql, 
  parseBatchCountResults, 
  createTransactionExecutor, 
  transformQueryResults, 
  normalizeValue, 
  setNormalizeDateMode,
  detectSqliteDateMode,
  planQueryStrategy, 
  executeWhereInSegments,
  buildReducerConfig,
  setRelationStats,
  setRoundtripRowEquivalent,
  setJsonRowFactor,
  type LateralRelationMeta, 
  type PrismaMethod, 
  type Model, 
  type BatchQuery, 
  type BatchCountQuery, 
  type TransactionQuery, 
  type TransactionOptions,
  getOrPrepareStatement,
  normalizeParams,
  executePostgresQuery,
  executeSqliteQuery,
  executeRaw,
} from "prisma-sql"

import { RELATION_STATS, ROUNDTRIP_ROW_EQUIVALENT, JSON_ROW_FACTOR } from './planner.generated'

setRelationStats(RELATION_STATS as any)
setRoundtripRowEquivalent(ROUNDTRIP_ROW_EQUIVALENT)
setJsonRowFactor(JSON_ROW_FACTOR)

class DeferredQuery {
  constructor(
    public readonly model: string,
    public readonly method: PrismaMethod,
    public readonly args: any,
  ) {}

  then(onfulfilled?: any, onrejected?: any): any {
    throw new Error(
      'Cannot await a batch query. Batch queries must not be awaited inside the $batch callback.',
    )
  }
}

interface BatchProxy {
  [modelName: string]: {
    findMany: (args?: any) => DeferredQuery
    findFirst: (args?: any) => DeferredQuery
    findUnique: (args?: any) => DeferredQuery
    count: (args?: any) => DeferredQuery
    aggregate: (args?: any) => DeferredQuery
    groupBy: (args?: any) => DeferredQuery
  }
}

const ACCELERATED_METHODS = new Set<PrismaMethod>([
  'findMany',
  'findFirst',
  'findUnique',
  'count',
  'aggregate',
  'groupBy',
])

function createBatchProxy(): BatchProxy {
  return new Proxy(
    {},
    {
      get(_target, modelName: string): any {
        if (typeof modelName === 'symbol') return undefined
        const model = MODEL_MAP.get(modelName)
        if (!model) {
          throw new Error(
            `Model '${modelName}' not found. Available: ${[...MODEL_MAP.keys()].join(', ')}`,
          )
        }
        return new Proxy(
          {},
          {
            get(_target, method: string): (args?: any) => DeferredQuery {
              if (!ACCELERATED_METHODS.has(method as PrismaMethod)) {
                throw new Error(
                  `Method '${method}' not supported in batch. Supported: ${[...ACCELERATED_METHODS].join(', ')}`,
                )
              }
              return (args?: any): DeferredQuery => {
                return new DeferredQuery(
                  modelName,
                  method as PrismaMethod,
                  args,
                )
              }
            },
          },
        )
      },
    },
  ) as BatchProxy
}

function getByPath(obj: any, path: string): unknown {
  if (!obj || !path) return undefined
  const keys = path.split('.')
  let result = obj
  for (const key of keys) {
    if (result == null) return undefined
    result = result[key]
  }
  return result
}

function resolveParamsFromMappings(args: any, paramMappings: any[]): unknown[] {
  const params: unknown[] = []
  for (let i = 0; i < paramMappings.length; i++) {
    const m = paramMappings[i]
    if (m.value !== undefined) {
      params.push(m.value)
      continue
    }
    if (m.dynamicName === undefined) {
      throw new Error(`CRITICAL: ParamMap ${m.index} has neither dynamicName nor value`)
    }
    const colonIdx = m.dynamicName.indexOf(':')
    const scopePath = colonIdx !== -1 ? m.dynamicName.slice(0, colonIdx) : null
    const name = colonIdx !== -1 ? m.dynamicName.slice(colonIdx + 1) : m.dynamicName
    let value: unknown
    if (!scopePath || scopePath.startsWith('root.')) {
      value = name.includes('.')
        ? getByPath(args, name)
        : args?.[name]
    } else {
      value = getByPath(args, scopePath)
    }
    if (value === undefined) {
      throw new Error(`Missing required parameter: ${m.dynamicName}`)
    }
    params.push(normalizeValue(value))
  }
  return params
}

function normalizeCompoundCursor(cursor: any, model: any): any {
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || cursor instanceof Date) return cursor
  const keys = Object.keys(cursor)
  if (keys.length !== 1) return cursor
  const key = keys[0]
  const value = cursor[key]
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) return cursor
  const scalarSet = new Set(model.fields.filter((f: any) => !f.isRelation).map((f: any) => f.name))
  if (scalarSet.has(key)) return cursor
  const nestedKeys = Object.keys(value)
  if (nestedKeys.length === 0) return cursor
  for (const nk of nestedKeys) {
    if (!scalarSet.has(nk)) return cursor
  }
  return value
}

const MODELS: Model[] = [
  {
    "name": "User",
    "tableName": "users",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "email",
        "dbName": "email",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "username",
        "dbName": "username",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "password",
        "dbName": "password",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "firstName",
        "dbName": "firstName",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "lastName",
        "dbName": "lastName",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "phone",
        "dbName": "phone",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "avatar",
        "dbName": "avatar",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "role",
        "dbName": "role",
        "type": "UserRole",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "UserStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "emailVerified",
        "dbName": "emailVerified",
        "type": "Boolean",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "lastLogin",
        "dbName": "lastLogin",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "passwordChangedAt",
        "dbName": "passwordChangedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "profile",
        "dbName": "profile",
        "type": "UserProfile",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "UserProfile",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "UserToUserProfile",
        "isForeignKeyLocal": false
      },
      {
        "name": "sessions",
        "dbName": "sessions",
        "type": "UserSession[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "UserSession",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "UserToUserSession",
        "isForeignKeyLocal": false
      },
      {
        "name": "activities",
        "dbName": "activities",
        "type": "UserActivity[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "UserActivity",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "UserToUserActivity",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdOrders",
        "dbName": "createdOrders",
        "type": "Order[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Order",
        "foreignKey": "createdById",
        "references": "id",
        "relationName": "CreatedBy",
        "isForeignKeyLocal": false
      },
      {
        "name": "assignedOrders",
        "dbName": "assignedOrders",
        "type": "Order[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Order",
        "foreignKey": "assignedProcurementOfficerId",
        "references": "id",
        "relationName": "AssignedProcurementOfficer",
        "isForeignKeyLocal": false
      },
      {
        "name": "wholesalerOrders",
        "dbName": "wholesalerOrders",
        "type": "Order[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Order",
        "foreignKey": "wholesalerId",
        "references": "id",
        "relationName": "WholesalerUser",
        "isForeignKeyLocal": false
      },
      {
        "name": "itemStatusUpdates",
        "dbName": "itemStatusUpdates",
        "type": "OrderItem[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OrderItem",
        "foreignKey": "statusUpdatedBy",
        "references": "id",
        "relationName": "ItemStatusUpdatedBy",
        "isForeignKeyLocal": false
      },
      {
        "name": "outOfStockReports",
        "dbName": "outOfStockReports",
        "type": "OutOfStockReport[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OutOfStockReport",
        "foreignKey": "wholesalerId",
        "references": "id",
        "relationName": "OutOfStockReportedBy",
        "isForeignKeyLocal": false
      },
      {
        "name": "resolvedOutOfStockReports",
        "dbName": "resolvedOutOfStockReports",
        "type": "OutOfStockReport[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OutOfStockReport",
        "foreignKey": "resolvedBy",
        "references": "id",
        "relationName": "OutOfStockResolvedBy",
        "isForeignKeyLocal": false
      },
      {
        "name": "adminProfile",
        "dbName": "adminProfile",
        "type": "AdminProfile",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "AdminProfile",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "AdminProfileToUser",
        "isForeignKeyLocal": false
      },
      {
        "name": "wholesalerProfile",
        "dbName": "wholesalerProfile",
        "type": "Wholesaler",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "Wholesaler",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "UserToWholesaler",
        "isForeignKeyLocal": false
      },
      {
        "name": "procurementOfficerProfile",
        "dbName": "procurementOfficerProfile",
        "type": "ProcurementOfficerProfile",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "ProcurementOfficerProfile",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "ProcurementOfficerProfileToUser",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdManufacturers",
        "dbName": "createdManufacturers",
        "type": "Manufacturer[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Manufacturer",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedManufacturers",
        "isForeignKeyLocal": false
      },
      {
        "name": "updatedManufacturers",
        "dbName": "updatedManufacturers",
        "type": "Manufacturer[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Manufacturer",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedManufacturers",
        "isForeignKeyLocal": false
      },
      {
        "name": "deletedManufacturers",
        "dbName": "deletedManufacturers",
        "type": "Manufacturer[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Manufacturer",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedManufacturers",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdBrands",
        "dbName": "createdBrands",
        "type": "Brand[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Brand",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedBrands",
        "isForeignKeyLocal": false
      },
      {
        "name": "updatedBrands",
        "dbName": "updatedBrands",
        "type": "Brand[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Brand",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedBrands",
        "isForeignKeyLocal": false
      },
      {
        "name": "deletedBrands",
        "dbName": "deletedBrands",
        "type": "Brand[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Brand",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedBrands",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdVariants",
        "dbName": "createdVariants",
        "type": "Variant[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Variant",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedVariants",
        "isForeignKeyLocal": false
      },
      {
        "name": "updatedVariants",
        "dbName": "updatedVariants",
        "type": "Variant[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Variant",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedVariants",
        "isForeignKeyLocal": false
      },
      {
        "name": "deletedVariants",
        "dbName": "deletedVariants",
        "type": "Variant[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Variant",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedVariants",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdCategories",
        "dbName": "createdCategories",
        "type": "Category[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Category",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedCategories",
        "isForeignKeyLocal": false
      },
      {
        "name": "updatedCategories",
        "dbName": "updatedCategories",
        "type": "Category[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Category",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedCategories",
        "isForeignKeyLocal": false
      },
      {
        "name": "deletedCategories",
        "dbName": "deletedCategories",
        "type": "Category[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Category",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedCategories",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdSubcategories",
        "dbName": "createdSubcategories",
        "type": "Subcategory[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Subcategory",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedSubcategories",
        "isForeignKeyLocal": false
      },
      {
        "name": "updatedSubcategories",
        "dbName": "updatedSubcategories",
        "type": "Subcategory[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Subcategory",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedSubcategories",
        "isForeignKeyLocal": false
      },
      {
        "name": "deletedSubcategories",
        "dbName": "deletedSubcategories",
        "type": "Subcategory[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Subcategory",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedSubcategories",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdProducts",
        "dbName": "createdProducts",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "updatedProducts",
        "dbName": "updatedProducts",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "deletedProducts",
        "dbName": "deletedProducts",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdPackSizes",
        "dbName": "createdPackSizes",
        "type": "PackSize[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackSize",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedPackSizes",
        "isForeignKeyLocal": false
      },
      {
        "name": "updatedPackSizes",
        "dbName": "updatedPackSizes",
        "type": "PackSize[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackSize",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedPackSizes",
        "isForeignKeyLocal": false
      },
      {
        "name": "deletedPackSizes",
        "dbName": "deletedPackSizes",
        "type": "PackSize[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackSize",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedPackSizes",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdPackTypes",
        "dbName": "createdPackTypes",
        "type": "PackType[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackType",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedPackTypes",
        "isForeignKeyLocal": false
      },
      {
        "name": "updatedPackTypes",
        "dbName": "updatedPackTypes",
        "type": "PackType[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackType",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedPackTypes",
        "isForeignKeyLocal": false
      },
      {
        "name": "deletedPackTypes",
        "dbName": "deletedPackTypes",
        "type": "PackType[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackType",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedPackTypes",
        "isForeignKeyLocal": false
      }
    ]
  },
  {
    "name": "UserProfile",
    "tableName": "user_profiles",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "userId",
        "dbName": "userId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "address",
        "dbName": "address",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "city",
        "dbName": "city",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "state",
        "dbName": "state",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "country",
        "dbName": "country",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "user",
        "dbName": "user",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "UserToUserProfile",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "UserSession",
    "tableName": "user_sessions",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "userId",
        "dbName": "userId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "token",
        "dbName": "token",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "expiresAt",
        "dbName": "expiresAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "ipAddress",
        "dbName": "ipAddress",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "userAgent",
        "dbName": "userAgent",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "user",
        "dbName": "user",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "UserToUserSession",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "PasswordReset",
    "tableName": "password_resets",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "email",
        "dbName": "email",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "token",
        "dbName": "token",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "expiresAt",
        "dbName": "expiresAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "used",
        "dbName": "used",
        "type": "Boolean",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      }
    ]
  },
  {
    "name": "UserActivity",
    "tableName": "user_activities",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "userId",
        "dbName": "userId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "action",
        "dbName": "action",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "resource",
        "dbName": "resource",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "resourceId",
        "dbName": "resourceId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "metadata",
        "dbName": "metadata",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "ipAddress",
        "dbName": "ipAddress",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "userAgent",
        "dbName": "userAgent",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "user",
        "dbName": "user",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "UserToUserActivity",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "Category",
    "tableName": "categories",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "slug",
        "dbName": "slug",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "description",
        "dbName": "description",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "CategoryStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedBy",
        "dbName": "updatedBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedBy",
        "dbName": "deletedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedAt",
        "dbName": "deletedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "subcategories",
        "dbName": "subcategories",
        "type": "Subcategory[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Subcategory",
        "foreignKey": "categoryId",
        "references": "id",
        "relationName": "CategorySubcategories",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdByUser",
        "dbName": "createdByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedCategories",
        "isForeignKeyLocal": true
      },
      {
        "name": "updatedByUser",
        "dbName": "updatedByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedCategories",
        "isForeignKeyLocal": true
      },
      {
        "name": "deletedByUser",
        "dbName": "deletedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedCategories",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "Subcategory",
    "tableName": "subcategories",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "slug",
        "dbName": "slug",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "description",
        "dbName": "description",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "categoryId",
        "dbName": "categoryId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "SubcategoryStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedBy",
        "dbName": "updatedBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedBy",
        "dbName": "deletedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedAt",
        "dbName": "deletedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "category",
        "dbName": "category",
        "type": "Category",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Category",
        "foreignKey": "categoryId",
        "references": "id",
        "relationName": "CategorySubcategories",
        "isForeignKeyLocal": true
      },
      {
        "name": "products",
        "dbName": "products",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "subcategoryId",
        "references": "id",
        "relationName": "SubcategoryProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdByUser",
        "dbName": "createdByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedSubcategories",
        "isForeignKeyLocal": true
      },
      {
        "name": "updatedByUser",
        "dbName": "updatedByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedSubcategories",
        "isForeignKeyLocal": true
      },
      {
        "name": "deletedByUser",
        "dbName": "deletedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedSubcategories",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "Variant",
    "tableName": "variants",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "description",
        "dbName": "description",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "brandId",
        "dbName": "brandId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedBy",
        "dbName": "updatedBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedBy",
        "dbName": "deletedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedAt",
        "dbName": "deletedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "brand",
        "dbName": "brand",
        "type": "Brand",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Brand",
        "foreignKey": "brandId",
        "references": "id",
        "relationName": "BrandVariants",
        "isForeignKeyLocal": true
      },
      {
        "name": "products",
        "dbName": "products",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "variantId",
        "references": "id",
        "relationName": "VariantProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "packSizes",
        "dbName": "packSizes",
        "type": "PackSize[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackSize",
        "foreignKey": "variantId",
        "references": "id",
        "relationName": "VariantPackSizes",
        "isForeignKeyLocal": false
      },
      {
        "name": "packTypes",
        "dbName": "packTypes",
        "type": "PackType[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackType",
        "foreignKey": "variantId",
        "references": "id",
        "relationName": "VariantPackTypes",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdByUser",
        "dbName": "createdByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedVariants",
        "isForeignKeyLocal": true
      },
      {
        "name": "updatedByUser",
        "dbName": "updatedByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedVariants",
        "isForeignKeyLocal": true
      },
      {
        "name": "deletedByUser",
        "dbName": "deletedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedVariants",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "PackSize",
    "tableName": "pack_sizes",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "variantId",
        "dbName": "variantId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "PackSizeStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedBy",
        "dbName": "updatedBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedBy",
        "dbName": "deletedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedAt",
        "dbName": "deletedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "variant",
        "dbName": "variant",
        "type": "Variant",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Variant",
        "foreignKey": "variantId",
        "references": "id",
        "relationName": "VariantPackSizes",
        "isForeignKeyLocal": true
      },
      {
        "name": "products",
        "dbName": "products",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "packSizeId",
        "references": "id",
        "relationName": "PackSizeProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdByUser",
        "dbName": "createdByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedPackSizes",
        "isForeignKeyLocal": true
      },
      {
        "name": "updatedByUser",
        "dbName": "updatedByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedPackSizes",
        "isForeignKeyLocal": true
      },
      {
        "name": "deletedByUser",
        "dbName": "deletedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedPackSizes",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "PackType",
    "tableName": "pack_types",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "variantId",
        "dbName": "variantId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "PackTypeStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedBy",
        "dbName": "updatedBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedBy",
        "dbName": "deletedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedAt",
        "dbName": "deletedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "variant",
        "dbName": "variant",
        "type": "Variant",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Variant",
        "foreignKey": "variantId",
        "references": "id",
        "relationName": "VariantPackTypes",
        "isForeignKeyLocal": true
      },
      {
        "name": "products",
        "dbName": "products",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "packTypeId",
        "references": "id",
        "relationName": "PackTypeProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdByUser",
        "dbName": "createdByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedPackTypes",
        "isForeignKeyLocal": true
      },
      {
        "name": "updatedByUser",
        "dbName": "updatedByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedPackTypes",
        "isForeignKeyLocal": true
      },
      {
        "name": "deletedByUser",
        "dbName": "deletedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedPackTypes",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "Product",
    "tableName": "products",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "description",
        "dbName": "description",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "sku",
        "dbName": "sku",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "brandId",
        "dbName": "brandId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "variantId",
        "dbName": "variantId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "subcategoryId",
        "dbName": "subcategoryId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "manufacturerId",
        "dbName": "manufacturerId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "packSizeId",
        "dbName": "packSizeId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "packTypeId",
        "dbName": "packTypeId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "price",
        "dbName": "price",
        "type": "Decimal",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "discount",
        "dbName": "discount",
        "type": "Decimal",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "quantity",
        "dbName": "quantity",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "images",
        "dbName": "images",
        "type": "String[]",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "thumbnail",
        "dbName": "thumbnail",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "ProductStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedBy",
        "dbName": "updatedBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedBy",
        "dbName": "deletedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedAt",
        "dbName": "deletedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "brand",
        "dbName": "brand",
        "type": "Brand",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Brand",
        "foreignKey": "brandId",
        "references": "id",
        "relationName": "BrandProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "variant",
        "dbName": "variant",
        "type": "Variant",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Variant",
        "foreignKey": "variantId",
        "references": "id",
        "relationName": "VariantProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "subcategory",
        "dbName": "subcategory",
        "type": "Subcategory",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "Subcategory",
        "foreignKey": "subcategoryId",
        "references": "id",
        "relationName": "SubcategoryProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "manufacturer",
        "dbName": "manufacturer",
        "type": "Manufacturer",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Manufacturer",
        "foreignKey": "manufacturerId",
        "references": "id",
        "relationName": "ManufacturerProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "packSize",
        "dbName": "packSize",
        "type": "PackSize",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackSize",
        "foreignKey": "packSizeId",
        "references": "id",
        "relationName": "PackSizeProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "packType",
        "dbName": "packType",
        "type": "PackType",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "PackType",
        "foreignKey": "packTypeId",
        "references": "id",
        "relationName": "PackTypeProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "createdByUser",
        "dbName": "createdByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "updatedByUser",
        "dbName": "updatedByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "deletedByUser",
        "dbName": "deletedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedProducts",
        "isForeignKeyLocal": true
      },
      {
        "name": "orderItems",
        "dbName": "orderItems",
        "type": "OrderItem[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OrderItem",
        "foreignKey": "productId",
        "references": "id",
        "relationName": "OrderItemToProduct",
        "isForeignKeyLocal": false
      },
      {
        "name": "stockMovements",
        "dbName": "stockMovements",
        "type": "StockMovement[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "StockMovement",
        "foreignKey": "productId",
        "references": "id",
        "relationName": "ProductToStockMovement",
        "isForeignKeyLocal": false
      },
      {
        "name": "outOfStockReportItems",
        "dbName": "outOfStockReportItems",
        "type": "OutOfStockReportItem[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OutOfStockReportItem",
        "foreignKey": "productId",
        "references": "id",
        "relationName": "OutOfStockReportItemToProduct",
        "isForeignKeyLocal": false
      }
    ]
  },
  {
    "name": "Order",
    "tableName": "orders",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "orderNumber",
        "dbName": "orderNumber",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "wholesalerId",
        "dbName": "wholesalerId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "assignedProcurementOfficerId",
        "dbName": "assignedProcurementOfficerId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdById",
        "dbName": "createdById",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "OrderStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "assignmentStatus",
        "dbName": "assignmentStatus",
        "type": "AssignmentStatus",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "assignedAt",
        "dbName": "assignedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "assignmentNotes",
        "dbName": "assignmentNotes",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "assignmentRespondedAt",
        "dbName": "assignmentRespondedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "assignmentResponseReason",
        "dbName": "assignmentResponseReason",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "monnifyInvoiceRef",
        "dbName": "monnifyInvoiceRef",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "virtualAccounts",
        "dbName": "virtualAccounts",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "checkoutUrl",
        "dbName": "checkoutUrl",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "paymentExpiresAt",
        "dbName": "paymentExpiresAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "subtotal",
        "dbName": "subtotal",
        "type": "Decimal",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "totalAmount",
        "dbName": "totalAmount",
        "type": "Decimal",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deliveryAddress",
        "dbName": "deliveryAddress",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "customerNotes",
        "dbName": "customerNotes",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "orderDate",
        "dbName": "orderDate",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "submittedAt",
        "dbName": "submittedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "confirmedAt",
        "dbName": "confirmedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "wholesaler",
        "dbName": "wholesaler",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "wholesalerId",
        "references": "id",
        "relationName": "WholesalerUser",
        "isForeignKeyLocal": true
      },
      {
        "name": "assignedProcurementOfficer",
        "dbName": "assignedProcurementOfficer",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "assignedProcurementOfficerId",
        "references": "id",
        "relationName": "AssignedProcurementOfficer",
        "isForeignKeyLocal": true
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdById",
        "references": "id",
        "relationName": "CreatedBy",
        "isForeignKeyLocal": true
      },
      {
        "name": "items",
        "dbName": "items",
        "type": "OrderItem[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OrderItem",
        "foreignKey": "orderId",
        "references": "id",
        "relationName": "OrderToOrderItem",
        "isForeignKeyLocal": false
      },
      {
        "name": "payments",
        "dbName": "payments",
        "type": "Payment[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Payment",
        "foreignKey": "orderId",
        "references": "id",
        "relationName": "OrderToPayment",
        "isForeignKeyLocal": false
      },
      {
        "name": "outOfStockReportItems",
        "dbName": "outOfStockReportItems",
        "type": "OutOfStockReportItem[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OutOfStockReportItem",
        "foreignKey": "orderId",
        "references": "id",
        "relationName": "OrderToOutOfStockReportItem",
        "isForeignKeyLocal": false
      }
    ]
  },
  {
    "name": "OrderItem",
    "tableName": "order_items",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "orderId",
        "dbName": "orderId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "productId",
        "dbName": "productId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "quantity",
        "dbName": "quantity",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "unitPrice",
        "dbName": "unitPrice",
        "type": "Decimal",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "lineTotal",
        "dbName": "lineTotal",
        "type": "Decimal",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "OrderItemStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "statusUpdatedAt",
        "dbName": "statusUpdatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "statusUpdatedBy",
        "dbName": "statusUpdatedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "processingNotes",
        "dbName": "processingNotes",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "order",
        "dbName": "order",
        "type": "Order",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Order",
        "foreignKey": "orderId",
        "references": "id",
        "relationName": "OrderToOrderItem",
        "isForeignKeyLocal": true
      },
      {
        "name": "product",
        "dbName": "product",
        "type": "Product",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "productId",
        "references": "id",
        "relationName": "OrderItemToProduct",
        "isForeignKeyLocal": true
      },
      {
        "name": "statusUpdatedByUser",
        "dbName": "statusUpdatedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "statusUpdatedBy",
        "references": "id",
        "relationName": "ItemStatusUpdatedBy",
        "isForeignKeyLocal": true
      },
      {
        "name": "outOfStockReportItems",
        "dbName": "outOfStockReportItems",
        "type": "OutOfStockReportItem[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OutOfStockReportItem",
        "foreignKey": "orderItemId",
        "references": "id",
        "relationName": "OrderItemToOutOfStockReportItem",
        "isForeignKeyLocal": false
      }
    ]
  },
  {
    "name": "Payment",
    "tableName": "payments",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "orderId",
        "dbName": "orderId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "order",
        "dbName": "order",
        "type": "Order",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Order",
        "foreignKey": "orderId",
        "references": "id",
        "relationName": "OrderToPayment",
        "isForeignKeyLocal": true
      },
      {
        "name": "monnifyInvoiceRef",
        "dbName": "monnifyInvoiceRef",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "transactionRef",
        "dbName": "transactionRef",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "paymentMethod",
        "dbName": "paymentMethod",
        "type": "PaymentMethod",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "amount",
        "dbName": "amount",
        "type": "Decimal",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "currency",
        "dbName": "currency",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "PaymentStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "virtualAccounts",
        "dbName": "virtualAccounts",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "checkoutUrl",
        "dbName": "checkoutUrl",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "paidAt",
        "dbName": "paidAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "webhookData",
        "dbName": "webhookData",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "reference",
        "dbName": "reference",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "notes",
        "dbName": "notes",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      }
    ]
  },
  {
    "name": "OutOfStockReport",
    "tableName": "out_of_stock_reports",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "wholesalerId",
        "dbName": "wholesalerId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "OutOfStockReportStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "resolvedAt",
        "dbName": "resolvedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "resolvedBy",
        "dbName": "resolvedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "wholesaler",
        "dbName": "wholesaler",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "wholesalerId",
        "references": "id",
        "relationName": "OutOfStockReportedBy",
        "isForeignKeyLocal": true
      },
      {
        "name": "resolver",
        "dbName": "resolver",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "resolvedBy",
        "references": "id",
        "relationName": "OutOfStockResolvedBy",
        "isForeignKeyLocal": true
      },
      {
        "name": "items",
        "dbName": "items",
        "type": "OutOfStockReportItem[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OutOfStockReportItem",
        "foreignKey": "reportId",
        "references": "id",
        "relationName": "OutOfStockReportToOutOfStockReportItem",
        "isForeignKeyLocal": false
      }
    ]
  },
  {
    "name": "OutOfStockReportItem",
    "tableName": "out_of_stock_report_items",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "reportId",
        "dbName": "reportId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "orderId",
        "dbName": "orderId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "orderItemId",
        "dbName": "orderItemId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "productId",
        "dbName": "productId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "quantityAffected",
        "dbName": "quantityAffected",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "report",
        "dbName": "report",
        "type": "OutOfStockReport",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OutOfStockReport",
        "foreignKey": "reportId",
        "references": "id",
        "relationName": "OutOfStockReportToOutOfStockReportItem",
        "isForeignKeyLocal": true
      },
      {
        "name": "order",
        "dbName": "order",
        "type": "Order",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Order",
        "foreignKey": "orderId",
        "references": "id",
        "relationName": "OrderToOutOfStockReportItem",
        "isForeignKeyLocal": true
      },
      {
        "name": "orderItem",
        "dbName": "orderItem",
        "type": "OrderItem",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "OrderItem",
        "foreignKey": "orderItemId",
        "references": "id",
        "relationName": "OrderItemToOutOfStockReportItem",
        "isForeignKeyLocal": true
      },
      {
        "name": "product",
        "dbName": "product",
        "type": "Product",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "productId",
        "references": "id",
        "relationName": "OutOfStockReportItemToProduct",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "StockMovement",
    "tableName": "stock_movements",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "productId",
        "dbName": "productId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "type",
        "dbName": "type",
        "type": "StockMovementType",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "quantity",
        "dbName": "quantity",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "reason",
        "dbName": "reason",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "reference",
        "dbName": "reference",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "product",
        "dbName": "product",
        "type": "Product",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "productId",
        "references": "id",
        "relationName": "ProductToStockMovement",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "SystemConfig",
    "tableName": "system_configs",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "key",
        "dbName": "key",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "value",
        "dbName": "value",
        "type": "Json",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      }
    ]
  },
  {
    "name": "AuditLog",
    "tableName": "audit_logs",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "userId",
        "dbName": "userId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "action",
        "dbName": "action",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "resource",
        "dbName": "resource",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "resourceId",
        "dbName": "resourceId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "oldData",
        "dbName": "oldData",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "newData",
        "dbName": "newData",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "ipAddress",
        "dbName": "ipAddress",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "userAgent",
        "dbName": "userAgent",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      }
    ]
  },
  {
    "name": "AdminProfile",
    "tableName": "admin_profiles",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "userId",
        "dbName": "userId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "permissions",
        "dbName": "permissions",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "assignedRegions",
        "dbName": "assignedRegions",
        "type": "String[]",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "lastActivity",
        "dbName": "lastActivity",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "loginAttempts",
        "dbName": "loginAttempts",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "accountLockUntil",
        "dbName": "accountLockUntil",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "canModifySystemConfig",
        "dbName": "canModifySystemConfig",
        "type": "Boolean",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "canSuspendAdmins",
        "dbName": "canSuspendAdmins",
        "type": "Boolean",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "canChangeUserRoles",
        "dbName": "canChangeUserRoles",
        "type": "Boolean",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "canChangeUserEmails",
        "dbName": "canChangeUserEmails",
        "type": "Boolean",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "user",
        "dbName": "user",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "AdminProfileToUser",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "Region",
    "tableName": "regions",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "country",
        "dbName": "country",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "state",
        "dbName": "state",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "isActive",
        "dbName": "isActive",
        "type": "Boolean",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "manufacturers",
        "dbName": "manufacturers",
        "type": "Manufacturer[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Manufacturer",
        "foreignKey": "regionId",
        "references": "id",
        "relationName": "ManufacturerToRegion",
        "isForeignKeyLocal": false
      },
      {
        "name": "wholesalers",
        "dbName": "wholesalers",
        "type": "Wholesaler[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Wholesaler",
        "foreignKey": "regionId",
        "references": "id",
        "relationName": "RegionToWholesaler",
        "isForeignKeyLocal": false
      },
      {
        "name": "procurementOfficers",
        "dbName": "procurementOfficers",
        "type": "ProcurementOfficerProfile[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "ProcurementOfficerProfile",
        "foreignKey": "regionId",
        "references": "id",
        "relationName": "ProcurementOfficerProfileToRegion",
        "isForeignKeyLocal": false
      }
    ]
  },
  {
    "name": "Manufacturer",
    "tableName": "manufacturers",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "description",
        "dbName": "description",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "ManufacturerStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedBy",
        "dbName": "updatedBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedBy",
        "dbName": "deletedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedAt",
        "dbName": "deletedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "brands",
        "dbName": "brands",
        "type": "Brand[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Brand",
        "foreignKey": "manufacturerId",
        "references": "id",
        "relationName": "ManufacturerBrands",
        "isForeignKeyLocal": false
      },
      {
        "name": "products",
        "dbName": "products",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "manufacturerId",
        "references": "id",
        "relationName": "ManufacturerProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdByUser",
        "dbName": "createdByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedManufacturers",
        "isForeignKeyLocal": true
      },
      {
        "name": "updatedByUser",
        "dbName": "updatedByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedManufacturers",
        "isForeignKeyLocal": true
      },
      {
        "name": "deletedByUser",
        "dbName": "deletedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedManufacturers",
        "isForeignKeyLocal": true
      },
      {
        "name": "region",
        "dbName": "region",
        "type": "Region",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "Region",
        "foreignKey": "regionId",
        "references": "id",
        "relationName": "ManufacturerToRegion",
        "isForeignKeyLocal": true
      },
      {
        "name": "regionId",
        "dbName": "regionId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      }
    ]
  },
  {
    "name": "Brand",
    "tableName": "brands",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "name",
        "dbName": "name",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "description",
        "dbName": "description",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "logo",
        "dbName": "logo",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "manufacturerId",
        "dbName": "manufacturerId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "BrandStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdBy",
        "dbName": "createdBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedBy",
        "dbName": "updatedBy",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedBy",
        "dbName": "deletedBy",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "deletedAt",
        "dbName": "deletedAt",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "manufacturer",
        "dbName": "manufacturer",
        "type": "Manufacturer",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Manufacturer",
        "foreignKey": "manufacturerId",
        "references": "id",
        "relationName": "ManufacturerBrands",
        "isForeignKeyLocal": true
      },
      {
        "name": "variants",
        "dbName": "variants",
        "type": "Variant[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Variant",
        "foreignKey": "brandId",
        "references": "id",
        "relationName": "BrandVariants",
        "isForeignKeyLocal": false
      },
      {
        "name": "products",
        "dbName": "products",
        "type": "Product[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Product",
        "foreignKey": "brandId",
        "references": "id",
        "relationName": "BrandProducts",
        "isForeignKeyLocal": false
      },
      {
        "name": "createdByUser",
        "dbName": "createdByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "createdBy",
        "references": "id",
        "relationName": "CreatedBrands",
        "isForeignKeyLocal": true
      },
      {
        "name": "updatedByUser",
        "dbName": "updatedByUser",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "updatedBy",
        "references": "id",
        "relationName": "UpdatedBrands",
        "isForeignKeyLocal": true
      },
      {
        "name": "deletedByUser",
        "dbName": "deletedByUser",
        "type": "User",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "deletedBy",
        "references": "id",
        "relationName": "DeletedBrands",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "Wholesaler",
    "tableName": "wholesalers",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "userId",
        "dbName": "userId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "regionId",
        "dbName": "regionId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "draftCart",
        "dbName": "draftCart",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "userAddress",
        "dbName": "userAddress",
        "type": "Json",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "totalOrders",
        "dbName": "totalOrders",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "totalSpent",
        "dbName": "totalSpent",
        "type": "Decimal",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "user",
        "dbName": "user",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "UserToWholesaler",
        "isForeignKeyLocal": true
      },
      {
        "name": "region",
        "dbName": "region",
        "type": "Region",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "Region",
        "foreignKey": "regionId",
        "references": "id",
        "relationName": "RegionToWholesaler",
        "isForeignKeyLocal": true
      },
      {
        "name": "inventory",
        "dbName": "inventory",
        "type": "Inventory[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Inventory",
        "foreignKey": "wholesalerId",
        "references": "id",
        "relationName": "InventoryToWholesaler",
        "isForeignKeyLocal": false
      }
    ]
  },
  {
    "name": "ProcurementOfficerProfile",
    "tableName": "procurement_officer_profiles",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "userId",
        "dbName": "userId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "regionId",
        "dbName": "regionId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "specializations",
        "dbName": "specializations",
        "type": "String[]",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "maxOrderValue",
        "dbName": "maxOrderValue",
        "type": "Decimal",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "availabilityStatus",
        "dbName": "availabilityStatus",
        "type": "ProcurementOfficerStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "maxActiveOrders",
        "dbName": "maxActiveOrders",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "ordersProcessed",
        "dbName": "ordersProcessed",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "averageProcessingTime",
        "dbName": "averageProcessingTime",
        "type": "Int",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "user",
        "dbName": "user",
        "type": "User",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "User",
        "foreignKey": "userId",
        "references": "id",
        "relationName": "ProcurementOfficerProfileToUser",
        "isForeignKeyLocal": true
      },
      {
        "name": "region",
        "dbName": "region",
        "type": "Region",
        "isRequired": false,
        "isRelation": true,
        "relatedModel": "Region",
        "foreignKey": "regionId",
        "references": "id",
        "relationName": "ProcurementOfficerProfileToRegion",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "Inventory",
    "tableName": "inventory",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "wholesalerId",
        "dbName": "wholesalerId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "productName",
        "dbName": "productName",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "productSku",
        "dbName": "productSku",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "currentStock",
        "dbName": "currentStock",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "minStock",
        "dbName": "minStock",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "maxStock",
        "dbName": "maxStock",
        "type": "Int",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "status",
        "dbName": "status",
        "type": "InventoryStatus",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "lastOrderDate",
        "dbName": "lastOrderDate",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "lastDeliveryDate",
        "dbName": "lastDeliveryDate",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "predictedRunOut",
        "dbName": "predictedRunOut",
        "type": "DateTime",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "consumptionRate",
        "dbName": "consumptionRate",
        "type": "Decimal",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "updatedAt",
        "dbName": "updatedAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "wholesaler",
        "dbName": "wholesaler",
        "type": "Wholesaler",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Wholesaler",
        "foreignKey": "wholesalerId",
        "references": "id",
        "relationName": "InventoryToWholesaler",
        "isForeignKeyLocal": true
      },
      {
        "name": "movements",
        "dbName": "movements",
        "type": "InventoryMovement[]",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "InventoryMovement",
        "foreignKey": "inventoryId",
        "references": "id",
        "relationName": "InventoryToInventoryMovement",
        "isForeignKeyLocal": false
      }
    ]
  },
  {
    "name": "InventoryMovement",
    "tableName": "inventory_movements",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "inventoryId",
        "dbName": "inventoryId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "type",
        "dbName": "type",
        "type": "InventoryMovementType",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "quantity",
        "dbName": "quantity",
        "type": "Int",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "reason",
        "dbName": "reason",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "orderId",
        "dbName": "orderId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "inventory",
        "dbName": "inventory",
        "type": "Inventory",
        "isRequired": true,
        "isRelation": true,
        "relatedModel": "Inventory",
        "foreignKey": "inventoryId",
        "references": "id",
        "relationName": "InventoryToInventoryMovement",
        "isForeignKeyLocal": true
      }
    ]
  },
  {
    "name": "AdminAuditLog",
    "tableName": "admin_audit_logs",
    "fields": [
      {
        "name": "id",
        "dbName": "id",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "adminId",
        "dbName": "adminId",
        "type": "String",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "action",
        "dbName": "action",
        "type": "AdminAction",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "resource",
        "dbName": "resource",
        "type": "ResourceType",
        "isRequired": true,
        "isRelation": false
      },
      {
        "name": "resourceId",
        "dbName": "resourceId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "regionId",
        "dbName": "regionId",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "oldData",
        "dbName": "oldData",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "newData",
        "dbName": "newData",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "metadata",
        "dbName": "metadata",
        "type": "Json",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "ipAddress",
        "dbName": "ipAddress",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "userAgent",
        "dbName": "userAgent",
        "type": "String",
        "isRequired": false,
        "isRelation": false
      },
      {
        "name": "createdAt",
        "dbName": "createdAt",
        "type": "DateTime",
        "isRequired": true,
        "isRelation": false
      }
    ]
  }
]

const ENUM_MAPPINGS: Record<string, Record<string, string>> = {
  "UserRole": {
    "SUPER_ADMIN": "SUPER_ADMIN",
    "ADMIN": "ADMIN",
    "PROCUREMENT_OFFICER": "PROCUREMENT_OFFICER",
    "WHOLESALER": "WHOLESALER"
  },
  "UserStatus": {
    "ACTIVE": "ACTIVE",
    "SUSPENDED": "SUSPENDED",
    "PENDING_APPROVAL": "PENDING_APPROVAL",
    "DEACTIVATED": "DEACTIVATED",
    "BLOCKED": "BLOCKED"
  },
  "ProductStatus": {
    "DRAFT": "DRAFT",
    "QUEUE": "QUEUE",
    "LIVE": "LIVE",
    "ARCHIVED": "ARCHIVED"
  },
  "PackSizeStatus": {
    "ACTIVE": "ACTIVE",
    "ARCHIVED": "ARCHIVED"
  },
  "PackTypeStatus": {
    "ACTIVE": "ACTIVE",
    "ARCHIVED": "ARCHIVED"
  },
  "OrderStatus": {
    "DRAFT": "DRAFT",
    "PENDING_PAYMENT": "PENDING_PAYMENT",
    "CONFIRMED": "CONFIRMED",
    "ASSIGNED": "ASSIGNED",
    "IN_PROGRESS": "IN_PROGRESS",
    "COMPLETED": "COMPLETED",
    "CANCELLED": "CANCELLED"
  },
  "OrderItemStatus": {
    "PENDING": "PENDING",
    "PAID": "PAID",
    "SOURCING": "SOURCING",
    "READY": "READY",
    "SHIPPED": "SHIPPED",
    "DELIVERED": "DELIVERED",
    "UNAVAILABLE": "UNAVAILABLE",
    "CANCELLED": "CANCELLED"
  },
  "AssignmentStatus": {
    "UNASSIGNED": "UNASSIGNED",
    "PENDING_ACCEPTANCE": "PENDING_ACCEPTANCE",
    "ACCEPTED": "ACCEPTED",
    "REJECTED": "REJECTED",
    "REASSIGNED": "REASSIGNED"
  },
  "ProcurementOfficerStatus": {
    "AVAILABLE": "AVAILABLE",
    "UNAVAILABLE": "UNAVAILABLE"
  },
  "PaymentStatus": {
    "PENDING": "PENDING",
    "COMPLETED": "COMPLETED",
    "FAILED": "FAILED",
    "CANCELLED": "CANCELLED",
    "REFUNDED": "REFUNDED"
  },
  "PaymentMethod": {
    "BANK_TRANSFER": "BANK_TRANSFER",
    "CHECKOUT_URL": "CHECKOUT_URL"
  },
  "OutOfStockReportStatus": {
    "OPEN": "OPEN",
    "RESOLVED": "RESOLVED"
  },
  "StockMovementType": {
    "IN": "IN",
    "OUT": "OUT",
    "ADJUSTMENT": "ADJUSTMENT"
  },
  "ManufacturerStatus": {
    "PENDING_APPROVAL": "PENDING_APPROVAL",
    "ACTIVE": "ACTIVE",
    "SUSPENDED": "SUSPENDED",
    "INACTIVE": "INACTIVE"
  },
  "BrandStatus": {
    "ACTIVE": "ACTIVE",
    "INACTIVE": "INACTIVE",
    "DISCONTINUED": "DISCONTINUED"
  },
  "CategoryStatus": {
    "ACTIVE": "ACTIVE",
    "INACTIVE": "INACTIVE",
    "ARCHIVED": "ARCHIVED"
  },
  "SubcategoryStatus": {
    "ACTIVE": "ACTIVE",
    "INACTIVE": "INACTIVE",
    "ARCHIVED": "ARCHIVED"
  },
  "InventoryStatus": {
    "IN_STOCK": "IN_STOCK",
    "LOW_STOCK": "LOW_STOCK",
    "OUT_OF_STOCK": "OUT_OF_STOCK",
    "DISCONTINUED": "DISCONTINUED"
  },
  "InventoryMovementType": {
    "INBOUND": "INBOUND",
    "OUTBOUND": "OUTBOUND",
    "ADJUSTMENT": "ADJUSTMENT",
    "DAMAGED": "DAMAGED",
    "EXPIRED": "EXPIRED"
  },
  "AdminAction": {
    "LOGIN_SUCCESS": "LOGIN_SUCCESS",
    "LOGIN_FAILED": "LOGIN_FAILED",
    "LOGOUT": "LOGOUT",
    "TOKEN_REFRESH": "TOKEN_REFRESH",
    "TOKEN_REFRESH_FAILED": "TOKEN_REFRESH_FAILED",
    "CREATE_MANUFACTURER": "CREATE_MANUFACTURER",
    "APPROVE_MANUFACTURER": "APPROVE_MANUFACTURER",
    "SUSPEND_MANUFACTURER": "SUSPEND_MANUFACTURER",
    "APPROVE_WHOLESALER": "APPROVE_WHOLESALER",
    "REJECT_WHOLESALER": "REJECT_WHOLESALER",
    "ASSIGN_SUB_ADMIN": "ASSIGN_SUB_ADMIN",
    "UPDATE_ORDER_STATUS": "UPDATE_ORDER_STATUS",
    "MANAGE_INVENTORY": "MANAGE_INVENTORY",
    "SYSTEM_CONFIG": "SYSTEM_CONFIG",
    "USER_MANAGEMENT": "USER_MANAGEMENT"
  },
  "ResourceType": {
    "MANUFACTURER": "MANUFACTURER",
    "WHOLESALER": "WHOLESALER",
    "SUB_ADMIN": "SUB_ADMIN",
    "ORDER": "ORDER",
    "INVENTORY": "INVENTORY",
    "REGION": "REGION",
    "SYSTEM_CONFIG": "SYSTEM_CONFIG",
    "ADMIN_AUTH": "ADMIN_AUTH"
  }
}

const ENUM_FIELDS: Record<string, Record<string, string>> = {
  "User": {
    "role": "UserRole",
    "status": "UserStatus"
  },
  "UserProfile": {},
  "UserSession": {},
  "PasswordReset": {},
  "UserActivity": {},
  "Category": {
    "status": "CategoryStatus"
  },
  "Subcategory": {
    "status": "SubcategoryStatus"
  },
  "Variant": {},
  "PackSize": {
    "status": "PackSizeStatus"
  },
  "PackType": {
    "status": "PackTypeStatus"
  },
  "Product": {
    "status": "ProductStatus"
  },
  "Order": {
    "status": "OrderStatus",
    "assignmentStatus": "AssignmentStatus"
  },
  "OrderItem": {
    "status": "OrderItemStatus"
  },
  "Payment": {
    "paymentMethod": "PaymentMethod",
    "status": "PaymentStatus"
  },
  "OutOfStockReport": {
    "status": "OutOfStockReportStatus"
  },
  "OutOfStockReportItem": {},
  "StockMovement": {
    "type": "StockMovementType"
  },
  "SystemConfig": {},
  "AuditLog": {},
  "AdminProfile": {},
  "Region": {},
  "Manufacturer": {
    "status": "ManufacturerStatus"
  },
  "Brand": {
    "status": "BrandStatus"
  },
  "Wholesaler": {},
  "ProcurementOfficerProfile": {
    "availabilityStatus": "ProcurementOfficerStatus"
  },
  "Inventory": {
    "status": "InventoryStatus"
  },
  "InventoryMovement": {
    "type": "InventoryMovementType"
  },
  "AdminAuditLog": {
    "action": "AdminAction",
    "resource": "ResourceType"
  }
}

const QUERIES: Record<string, Record<string, Record<string, {
  sql: string
  params: unknown[]
  dynamicKeys: string[]
  paramMappings: any[]
  requiresReduction: boolean
  includeSpec: Record<string, any>
  isLateral?: boolean
  lateralMeta?: any[]
  skipWhereIn?: boolean
}>>> = {}

const DIALECT = "postgres"

const MODEL_MAP = new Map(MODELS.map(m => [m.name, m]))

function isDynamicKeyForQueryKey(path: string[], key: string): boolean {
  if (key !== 'skip' && key !== 'take' && key !== 'cursor') return false
  const parent = path.length > 0 ? path[path.length - 1] : null
  if (!parent) return true
  if (parent === 'include' || parent === 'select') return false
  if (path.includes('where')) return false
  if (path.includes('data')) return false
  if (path.includes('orderBy')) return false
  if (path.includes('having')) return false
  if (path.includes('by')) return false
  return true
}

function shouldSkipEnumTransform(path: string[], key: string): boolean {
  if (path.length === 0) return false
  
  const parent = path[path.length - 1]
  
  if (parent === 'orderBy') return true
  if (path.includes('orderBy')) return true
  
  if (parent === 'cursor') return true
  if (path.includes('cursor')) return true
  
  return false
}

function transformEnumInValue(value: unknown, enumType: string | undefined): unknown {
  if (!enumType || value === null || value === undefined) {
    return value
  }

  const mapping = ENUM_MAPPINGS[enumType]
  if (!mapping) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === 'string') {
        if (mapping[v] !== undefined) {
          return mapping[v]
        }
        throw new Error(
          `Invalid enum value '${v}' for type ${enumType}. Valid values: ${Object.keys(mapping).join(', ')}`
        )
      }
      return v
    })
  }

  if (typeof value === 'string') {
    if (mapping[value] !== undefined) {
      return mapping[value]
    }
    throw new Error(
      `Invalid enum value '${value}' for type ${enumType}. Valid values: ${Object.keys(mapping).join(', ')}`
    )
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = transformEnumInValue(v, enumType)
    }
    return result
  }

  return value
}

function getRelatedModelName(currentModelName: string, relationFieldName: string): string | null {
  const m = MODEL_MAP.get(currentModelName)
  if (!m) return null
  const f: any = (m as any).fields?.find((x: any) => x?.name === relationFieldName)
  if (!f || !f.isRelation) return null
  return f.relatedModel || null
}

function transformEnumValuesByModel(modelName: string, obj: any, path: string[] = []): any {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformEnumValuesByModel(modelName, item, path))
  }

  if (obj instanceof Date) {
    return obj
  }

  if (typeof obj === 'object') {
    const transformed: any = {}
    const modelFields = (ENUM_FIELDS as any)[modelName] || {}
    for (const [key, value] of Object.entries(obj)) {
      const nextPath = [...path, key]

      if (shouldSkipEnumTransform(path, key)) {
        transformed[key] = value
        continue
      }

      const relModel = getRelatedModelName(modelName, key)
      if (relModel && value && typeof value === 'object') {
        transformed[key] = transformEnumValuesByModel(relModel, value, nextPath)
        continue
      }

      const enumType = modelFields[key]
      if (enumType) {
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          const transformedOperators: any = {}
          for (const [op, opValue] of Object.entries(value)) {
            transformedOperators[op] = transformEnumInValue(opValue, enumType)
          }
          transformed[key] = transformedOperators
        } else {
          transformed[key] = transformEnumInValue(value, enumType)
        }
      } else if (value instanceof Date) {
        transformed[key] = value
      } else if (typeof value === 'object' && value !== null) {
        transformed[key] = transformEnumValuesByModel(modelName, value, nextPath)
      } else {
        transformed[key] = value
      }
    }
    return transformed
  }

  return obj
}

const BIGINT_MARKER = ' BIGINT '

function bigIntSafeReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return BIGINT_MARKER + value.toString()
  return value
}

function bigIntReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith(BIGINT_MARKER)) {
    return BigInt(value.slice(BIGINT_MARKER.length))
  }
  return value
}

function normalizeQuery(args: any): string {
  if (!args) return '{}'
  const jsonStr = JSON.stringify(args, bigIntSafeReplacer)
  const normalized = JSON.parse(jsonStr, bigIntReviver)

  function replaceDynamicParams(obj: any, path: string[] = []): any {
    if (!obj || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) {
      return obj.map((v) => replaceDynamicParams(v, path))
    }
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (isDynamicKeyForQueryKey(path, key)) {
        result[key] = `__DYNAMIC_${key}__`
      } else {
        result[key] = replaceDynamicParams(value, [...path, key])
      }
    }
    return result
  }

  const withMarkers = replaceDynamicParams(normalized)

  return JSON.stringify(withMarkers, (key, value) => {
    if (typeof value === 'bigint') return '__bigint__' + value.toString()
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(value).sort()) {
        sorted[k] = (value as any)[k]
      }
      return sorted
    }
    return value
  })
}

export function speedExtension(config: {
  postgres?: any
  sqlite?: any
  debug?: boolean
  onQuery?: (info: {
    model: string
    method: string
    sql: string
    params: unknown[]
    duration: number
    prebaked: boolean
  }) => void
}) {
  const { postgres, sqlite, debug, onQuery } = config
  if (!postgres && !sqlite) {
    throw new Error('speedExtension requires postgres or sqlite client')
  }
  const client = postgres || sqlite
  const actualDialect = postgres ? 'postgres' : 'sqlite'
  if (actualDialect !== DIALECT) {
    throw new Error(`Generated code is for ${DIALECT}, but you provided ${actualDialect}`)
  }

  if ((DIALECT as string) === 'sqlite') {
    setNormalizeDateMode(detectSqliteDateMode(client))
  }

  async function executeQuery(
    sql: string,
    params: unknown[],
    method: string,
    requiresReduction: boolean,
    includeSpec: Record<string, any> | undefined,
    model: any | undefined,
    isLateral?: boolean,
    lateralMeta?: LateralRelationMeta[],
  ): Promise<unknown[]> {
    if (DIALECT === 'postgres') {
      return executePostgresQuery({
        client,
        sql,
        params,
        method,
        requiresReduction,
        includeSpec,
        model,
        allModels: MODELS,
        isLateral,
        lateralMeta,
      })
    }

    try {
      const result = executeSqliteQuery(client, sql, params, method, model)
      return result
    } catch (err) {
      console.log('[sqlite-debug] FAILED:', err instanceof Error ? err.message : err)
      throw err
    }
  }

  async function executeWhereInQuery(sql: string, params: unknown[]): Promise<unknown[]> {
    const normalizedParams = normalizeParams(params)

    if (DIALECT === 'postgres') {
      const results: any[] = []
      await client.unsafe(sql, normalizedParams).forEach((row: any) => {
        results.push(row)
      })
      return results
    }

    const stmt = getOrPrepareStatement(client, sql)
    return stmt.all(...normalizedParams)
  }

  return (prisma: any) => {
    const txExecutor = createTransactionExecutor({
      modelMap: MODEL_MAP,
      allModels: MODELS,
      dialect: DIALECT,
      executeRaw: (sql: string, params?: unknown[]) => executeRaw(client, sql, params, DIALECT),
      postgresClient: postgres,
    })

    const originalTransaction = prisma.$transaction.bind(prisma)

    interface ModelContext {
      name?: string
      $name?: string
      $parent?: any
    }

  async function handleMethod(
      this: ModelContext,
      method: PrismaMethod,
      args: unknown
    ): Promise<unknown> {
      const modelName = this?.name || this?.$name

      if (!modelName || typeof modelName !== 'string') {
        throw new Error('Cannot determine model name from context')
      }

      const startTime = Date.now()
      let sql: string | undefined

      try {
        if (args !== undefined && args !== null && typeof args !== 'object') {
          throw new Error(
            `Invalid args type for ${modelName}.${method}: expected object, got ${typeof args}`
          )
        }

        let transformedArgs = transformEnumValuesByModel(modelName, args || {})

        const model = MODEL_MAP.get(modelName)
        if (!model) {
          if (!this.$parent?.[modelName]?.[method]) {
            throw new Error(`Model '${modelName}' not found and no Prisma fallback available`)
          }
          return this.$parent[modelName][method](args)
        }

        if (transformedArgs.cursor) {
          const flatCursor = normalizeCompoundCursor(transformedArgs.cursor, model)
          if (flatCursor !== transformedArgs.cursor) {
            transformedArgs = { ...transformedArgs, cursor: flatCursor }
          }
        }

        const plan = planQueryStrategy({
          model,
          method,
          args: transformedArgs,
          allModels: MODELS,
          dialect: DIALECT,
        })

        const queryKey = normalizeQuery(plan.filteredArgs)
        const prebakedQuery = QUERIES[modelName]?.[method]?.[queryKey]
        let params: unknown[]
        let prebaked = false
        let requiresReduction = false
        let includeSpec: Record<string, any> | undefined
        let isLateral = false
        let lateralMeta: any[] | undefined
        let skipWhereIn = false

        if (prebakedQuery) {
          sql = prebakedQuery.sql
          params = resolveParamsFromMappings(plan.filteredArgs, prebakedQuery.paramMappings)
          prebaked = true
          requiresReduction = prebakedQuery.requiresReduction || false
          includeSpec = prebakedQuery.includeSpec
          isLateral = prebakedQuery.isLateral || false
          lateralMeta = prebakedQuery.lateralMeta
          skipWhereIn = prebakedQuery.skipWhereIn || false
        } else {
          const buildArgs = plan.whereInSegments.length > 0
            ? { ...plan.filteredArgs, __originalArgs: plan.originalArgs }
            : plan.filteredArgs
          const result = buildSQL(model, MODELS, method, buildArgs, DIALECT)
          sql = result.sql
          params = result.params as unknown[]
          requiresReduction = result.requiresReduction || false
          includeSpec = result.includeSpec
          isLateral = result.isLateral || false
          lateralMeta = result.lateralMeta
          skipWhereIn = result.skipWhereIn || false
        }

        if (debug) {
          const strategy = DIALECT === 'postgres'
            ? (isLateral ? 'LATERAL JOIN' : requiresReduction ? 'STREAMING REDUCTION' : 'STREAMING')
            : (requiresReduction ? 'BUFFERED REDUCTION' : 'DIRECT')

          const whereInMode = plan.whereInSegments.length > 0 && !skipWhereIn
            ? (DIALECT === 'postgres' ? 'STREAMING PARALLEL' : 'SEQUENTIAL')
            : 'NONE'

          console.log(`[${DIALECT}] ${modelName}.${method} - ${strategy} + WHERE IN: ${whereInMode}`)
          console.log(`  Invoked: ${modelName}.${method}(`, args, `)`)
          console.log(`  Prebaked: ${prebaked}, skipWhereIn: ${skipWhereIn}`)
          console.log('  SQL:', sql)
          console.log('  Params:', params)
        }

        if (plan.whereInSegments.length > 0 && !skipWhereIn) {
          if (DIALECT === 'postgres') {
            const { executeWhereInSegmentsStreaming } = await import("prisma-sql")

            const results = await executeWhereInSegmentsStreaming({
              segments: plan.whereInSegments,
              parentSql: sql,
              parentParams: normalizeParams(params),
              parentModel: model,
              allModels: MODELS,
              modelMap: MODEL_MAP,
              dialect: DIALECT,
              execute: async (sql: string, params: unknown[]) => {
                const results: any[] = []
                await client.unsafe(sql, normalizeParams(params)).forEach((row: any) => {
                  results.push(row)
                })
                return results
              },
              stream: async (sql: string, params: unknown[], onRow: (row: any) => void) => {
                await client.unsafe(sql, normalizeParams(params)).forEach(onRow)
              },
              parentTake: typeof plan.filteredArgs?.take === 'number'
                ? plan.filteredArgs.take
                : undefined,
            })

            if (plan.injectedParentKeys.length > 0) {
              for (const row of results) {
                for (const key of plan.injectedParentKeys) {
                  delete row[key]
                }
              }
            }

            const duration = Date.now() - startTime
            onQuery?.({ model: modelName, method, sql, params, duration, prebaked })

            return transformQueryResults(method, results, model)
          } else {
            const parentRows = await executeQuery(sql, params, method, requiresReduction, includeSpec, model, isLateral, lateralMeta) as any[]

            if (parentRows.length > 0) {
              await executeWhereInSegments({
                segments: plan.whereInSegments,
                parentRows,
                parentModel: model,
                allModels: MODELS,
                modelMap: MODEL_MAP,
                dialect: DIALECT,
                execute: executeWhereInQuery,
              })

              if (plan.injectedParentKeys.length > 0) {
                for (const row of parentRows) {
                  for (const key of plan.injectedParentKeys) {
                    delete row[key]
                  }
                }
              }
            }

            const duration = Date.now() - startTime
            onQuery?.({ model: modelName, method, sql, params, duration, prebaked })

            return transformQueryResults(method, parentRows, model)
          }
        }

        const results = await executeQuery(sql, params, method, requiresReduction, includeSpec, model, isLateral, lateralMeta)

        const duration = Date.now() - startTime
        onQuery?.({ model: modelName, method, sql, params, duration, prebaked })

        return transformQueryResults(method, results, model)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn(`[prisma-sql] ${modelName}.${method} acceleration failed: ${msg}${typeof sql === 'string' ? '\n  SQL: ' + sql.slice(0, 500) : ''}`)

        if (debug && error instanceof Error && error.stack) {
          console.warn(error.stack)
        }

        if (!this.$parent?.[modelName]?.[method]) {
          throw error
        }

        return this.$parent[modelName][method](args)
      }
    }

    async function* findManyStream(
      this: ModelContext,
      args?: unknown
    ): AsyncIterableIterator<any> {
      const modelName = this?.name || this?.$name

      if (!modelName || typeof modelName !== 'string') {
        throw new Error('Cannot determine model name from context')
      }

      if (DIALECT !== 'postgres') {
        throw new Error('Streaming requires postgres.js client')
      }

      let transformedArgs = transformEnumValuesByModel(modelName, args || {})
      const model = MODEL_MAP.get(modelName)
      if (!model) {
        throw new Error(`Model '${modelName}' not found`)
      }

      if (transformedArgs.cursor) {
        const flatCursor = normalizeCompoundCursor(transformedArgs.cursor, model)
        if (flatCursor !== transformedArgs.cursor) {
          transformedArgs = { ...transformedArgs, cursor: flatCursor }
        }
      }

      const plan = planQueryStrategy({
        model,
        method: 'findMany',
        args: transformedArgs,
        allModels: MODELS,
        dialect: DIALECT,
      })

      const queryKey = normalizeQuery(plan.filteredArgs)
      const prebakedQuery = QUERIES[modelName]?.['findMany']?.[queryKey]

      let sql: string
      let params: unknown[]
      let requiresReduction = false
      let includeSpec: Record<string, any> | undefined
      let isLateral = false
      let lateralMeta: any[] | undefined

      if (prebakedQuery) {
        sql = prebakedQuery.sql
        params = resolveParamsFromMappings(plan.filteredArgs, prebakedQuery.paramMappings)
        requiresReduction = prebakedQuery.requiresReduction
        includeSpec = prebakedQuery.includeSpec
        isLateral = prebakedQuery.isLateral || false
        lateralMeta = prebakedQuery.lateralMeta
      } else {
        const result = buildSQL(model, MODELS, 'findMany', plan.filteredArgs, DIALECT)
        sql = result.sql
        params = result.params as unknown[]
        requiresReduction = result.requiresReduction || false
        includeSpec = result.includeSpec
        isLateral = result.isLateral || false
        lateralMeta = result.lateralMeta
      }

      const normalizedParams = normalizeParams(params)

      if (isLateral && lateralMeta) {
        const { buildLateralReducerConfig, reduceLateralRows } = await import("prisma-sql")
        const config = buildLateralReducerConfig(model, lateralMeta)
        const results: any[] = []

        await client.unsafe(sql, normalizedParams).forEach((row: any) => {
          results.push(row)
        })

        const reduced = reduceLateralRows(results, config)
        for (const item of reduced) {
          yield item
        }
      } else if (requiresReduction && includeSpec) {
        const { createProgressiveReducer } = await import("prisma-sql")
        const config = buildReducerConfig(model, includeSpec, MODELS)
        const reducer = createProgressiveReducer(config)

        const completed: any[] = []
        let lastParentKey: string | null = null

        await client.unsafe(sql, normalizedParams).forEach((row: any) => {
          reducer.processRow(row)
          const currentKey = reducer.getCurrentParentKey(row)

          if (currentKey !== lastParentKey && lastParentKey !== null) {
            const parent = reducer.getCompletedParent(lastParentKey)
            if (parent) {
              completed.push(parent)
            }
          }

          lastParentKey = currentKey
        })

        const remaining = reducer.getRemainingParents()
        for (const parent of remaining) {
          completed.push(parent)
        }

        for (const item of completed) {
          yield item
        }
      } else {
        const rows: any[] = []
        await client.unsafe(sql, normalizedParams).forEach((row: any) => {
          rows.push(row)
        })

        for (const row of rows) {
          yield row
        }
      }
    }

    async function batch<T extends Record<string, DeferredQuery>>(
      callback: (batch: BatchProxy) => T | Promise<T>,
    ): Promise<{ [K in keyof T]: any }> {
      const batchProxy = createBatchProxy()
      const queries = await callback(batchProxy)
      const batchQueries: Record<string, BatchQuery> = {}
      for (const [key, deferred] of Object.entries(queries)) {
        if (!(deferred instanceof DeferredQuery)) {
          throw new Error(
            `Batch query '${key}' must be a deferred query. Did you await it?`,
          )
        }
        batchQueries[key] = {
          model: deferred.model,
          method: deferred.method,
          args: transformEnumValuesByModel(deferred.model, deferred.args || {}),
        }
      }

      const startTime = Date.now()
      const { sql, params, keys, aliases } = buildBatchSql(
        batchQueries,
        MODEL_MAP,
        MODELS,
        DIALECT,
      )

      if (debug) {
        console.log(`[${DIALECT}] $batch (${keys.length} queries)`)
        console.log('SQL:', sql)
        console.log('Params:', params)
      }

      const normalizedParams = normalizeParams(params)

      let row: Record<string, unknown>
      if (DIALECT === 'postgres') {
        const rows: any[] = []
        await client.unsafe(sql, normalizedParams as any[]).forEach((r: any) => {
          rows.push(r)
        })
        row = rows[0] as Record<string, unknown>
      } else {
        const stmt = getOrPrepareStatement(client, sql)
        row = stmt.get(...normalizedParams) as Record<string, unknown>
      }

      const results = parseBatchResults(row, keys, batchQueries, aliases, MODEL_MAP)

      const duration = Date.now() - startTime
      onQuery?.({
        model: '_batch',
        method: 'batch',
        sql,
        params: normalizedParams,
        duration,
        prebaked: false,
      })

      return results as { [K in keyof T]: any }
    }

    async function batchCount(queries: BatchCountQuery[]): Promise<number[]> {
      if (queries.length === 0) return []
      const startTime = Date.now()
      const { sql, params } = buildBatchCountSql(
        queries,
        MODEL_MAP,
        MODELS,
        DIALECT,
      )

      if (debug) {
        console.log(`[${DIALECT}] $batchCount (${queries.length} queries)`)
        console.log('SQL:', sql)
        console.log('Params:', params)
      }

      const normalizedParams = normalizeParams(params)

      let row: Record<string, unknown>
      if (DIALECT === 'postgres') {
        const rows: any[] = []
        await client.unsafe(sql, normalizedParams as any[]).forEach((r: any) => {
          rows.push(r)
        })
        row = rows[0] as Record<string, unknown>
      } else {
        const stmt = getOrPrepareStatement(client, sql)
        row = stmt.get(...normalizedParams) as Record<string, unknown>
      }

      const results = parseBatchCountResults(row, queries.length)

      const duration = Date.now() - startTime
      onQuery?.({
        model: '_batch',
        method: 'count',
        sql,
        params: normalizedParams,
        duration,
        prebaked: false,
      })

      return results
    }

    async function transaction(
      queriesOrFn: TransactionQuery[] | any[] | ((...args: any[]) => Promise<any>),
      options?: TransactionOptions,
    ): Promise<unknown[]> {
      if (typeof queriesOrFn === 'function') {
        return originalTransaction(queriesOrFn, options)
      }

      const queries = queriesOrFn

      if (!queries || queries.length === 0) {
        return []
      }

      const isTransactionQuery = queries.every(q =>
        q &&
        typeof q === 'object' &&
        !q.then &&
        'model' in q &&
        'method' in q &&
        typeof q.model === 'string' &&
        typeof q.method === 'string'
      )

      if (!isTransactionQuery) {
        return Promise.all(queries)
      }

      const startTime = Date.now()
      if (debug) {
        console.log(`[${DIALECT}] $transaction (${queries.length} queries)`)
        if (options?.isolationLevel) {
          console.log(`  Isolation level: ${options.isolationLevel}`)
        }
      }
      const transformedQueries = queries.map(q => ({
        ...q,
        args: transformEnumValuesByModel(q.model, q.args || {}),
      }))
      const results = await txExecutor.execute(transformedQueries, options)
      const duration = Date.now() - startTime
      onQuery?.({
        model: '_transaction',
        method: 'transaction',
        sql: `TRANSACTION(${queries.length})`,
        params: [],
        duration,
        prebaked: false,
      })
      return results
    }

    return prisma.$extends({
      name: 'prisma-sql-generated',
      client: {
        $original: prisma,
        $batch: batch as <T extends Record<string, DeferredQuery>>(
          callback: (batch: BatchProxy) => T | Promise<T>,
        ) => Promise<{ [K in keyof T]: any }>,
        $batchCount: batchCount as (...args: any[]) => Promise<number[]>,
        $transaction: transaction as (...args: any[]) => Promise<unknown[]>,
      },
      model: {
        $allModels: {
          async findMany(this: ModelContext, args: any) {
            return handleMethod.call(this, 'findMany', args)
          },
          async findFirst(this: ModelContext, args: any) {
            return handleMethod.call(this, 'findFirst', args)
          },
          async findUnique(this: ModelContext, args: any) {
            return handleMethod.call(this, 'findUnique', args)
          },
          async count(this: ModelContext, args: any) {
            return handleMethod.call(this, 'count', args)
          },
          async aggregate(this: ModelContext, args: any) {
            return handleMethod.call(this, 'aggregate', args)
          },
          async groupBy(this: ModelContext, args: any) {
            return handleMethod.call(this, 'groupBy', args)
          },
          findManyStream(this: ModelContext, args?: any): AsyncIterableIterator<any> {
            return findManyStream.call(this, args)
          },
        },
      },
    })
  }
}

type SpeedExtensionReturn = ReturnType<ReturnType<typeof speedExtension>>

export type SpeedClient<T> = T & {
  $batch<T extends Record<string, DeferredQuery>>(
    callback: (batch: BatchProxy) => T | Promise<T>,
  ): Promise<{ [K in keyof T]: any }>
  $batchCount(queries: BatchCountQuery[]): Promise<number[]>
  $transaction(queries: TransactionQuery[], options?: TransactionOptions): Promise<unknown[]>
}

export type WithStreaming<T> = T & {
  findManyStream(args?: any): AsyncIterableIterator<any>
}

export type { BatchCountQuery, TransactionQuery, TransactionOptions }