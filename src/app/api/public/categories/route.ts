import { connection } from "next/server";
import { createCategoriesHandler } from "@/lib/public-api/handlers";
import { publicApiDependencies } from "@/lib/public-api/production";

const handleCategories = createCategoriesHandler(publicApiDependencies);

export async function GET() {
  await connection();
  return handleCategories();
}
