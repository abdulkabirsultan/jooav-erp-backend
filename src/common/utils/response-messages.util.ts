/**
 * Utility class for generating consistent response messages across the application
 */
export class ResponseMessages {
  // Helper method to properly pluralize entity names
  private static pluralize(entityType: string): string {
    const entityTypeLower = entityType.toLowerCase();

    // Handle special pluralization cases
    const specialPlurals: Record<string, string> = {
      category: 'categories',
      subcategory: 'subcategories',
      company: 'companies',
      entity: 'entities',
      query: 'queries',
      city: 'cities',
      country: 'countries',
    };

    return specialPlurals[entityTypeLower] || `${entityTypeLower}s`;
  }

  // Generic CRUD operations
  static created(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' has been created successfully`;
  }

  static updated(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' has been updated successfully`;
  }

  static deleted(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' has been deleted successfully`;
  }

  static retrieved(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' retrieved successfully`;
  }

  // Status-specific operations
  static statusChanged(
    entityType: string,
    entityName: string,
    newStatus: string,
  ): string {
    const statusText = newStatus.toLowerCase().replace(/_/g, ' ');
    return `${entityType} '${entityName}' has been ${statusText} successfully`;
  }

  static activated(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' has been activated successfully`;
  }

  static suspended(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' has been suspended successfully`;
  }

  static deactivated(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' has been deactivated successfully`;
  }

  // List/pagination operations
  static foundItems(count: number, entityType: string, total?: number): string {
    const entityTypeLower = entityType.toLowerCase();
    const plural = count === 1 ? entityTypeLower : this.pluralize(entityType);

    if (total !== undefined && total !== count) {
      return `Found ${count} ${plural} out of ${total} total`;
    }
    return `Found ${count} ${plural}`;
  }

  static noItemsFound(entityType: string): string {
    return `No ${this.pluralize(entityType)} found`;
  }

  // Special operations
  static logoUpdated(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' logo has been updated successfully`;
  }

  static logoDeleted(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' logo has been removed successfully`;
  }

  static permissionsUpdated(entityType: string, entityName: string): string {
    return `${entityType} '${entityName}' permissions have been updated successfully`;
  }

  static roleUpdated(
    entityType: string,
    entityName: string,
    newRole: string,
  ): string {
    return `${entityType} '${entityName}' role has been changed to ${newRole.toLowerCase().replace(/_/g, ' ')} successfully`;
  }

  // Bulk operations
  static bulkCreated(count: number, entityType: string): string {
    const entityTypeLower = entityType.toLowerCase();
    const plural = count === 1 ? entityTypeLower : this.pluralize(entityType);
    return `${count} ${plural} have been created successfully`;
  }

  static bulkUpdated(count: number, entityType: string): string {
    const entityTypeLower = entityType.toLowerCase();
    const plural = count === 1 ? entityTypeLower : this.pluralize(entityType);
    return `${count} ${plural} have been updated successfully`;
  }

  static bulkDeleted(count: number, entityType: string): string {
    const entityTypeLower = entityType.toLowerCase();
    const plural = count === 1 ? entityTypeLower : this.pluralize(entityType);
    return `${count} ${plural} have been deleted successfully`;
  }

  static bulkOperation(
    operation: string,
    count: number,
    entityTypeSingular: string,
    entityTypePlural?: string,
  ): string {
    const plural =
      count === 1
        ? entityTypeSingular
        : entityTypePlural || `${entityTypeSingular}s`;
    return `${count} ${plural} have been ${operation} successfully`;
  }

  // Statistics and analytics
  static statsRetrieved(entityType: string): string {
    return `${entityType} statistics retrieved successfully`;
  }

  // Generic success message fallback
  static operationSuccess(
    operation: string,
    entityType?: string,
    entityName?: string,
  ): string {
    if (entityType && entityName) {
      return `${entityType} '${entityName}' ${operation} completed successfully`;
    }
    if (entityType) {
      return `${entityType} ${operation} completed successfully`;
    }
    return `${operation} completed successfully`;
  }
}
