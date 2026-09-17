export interface ICategory {
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: string | null;
}
