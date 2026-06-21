// ============================================================
// Food Database — 常见健身食物营养成分 (per 100g)
// ============================================================
// kcal = protein*4 + carbs*4 + fat*9 (近似值，用于一致性)
// ============================================================

import type { FoodItem, FoodCategory } from "@/lib/types";

export const FOOD_DATABASE: FoodItem[] = [
  // ====== 肉类 ======
  { id: "chicken-breast", name: "鸡胸肉", category: "肉类", proteinPer100g: 23.1, carbsPer100g: 0, fatPer100g: 1.2, kcalPer100g: 103 },
  { id: "chicken-thigh", name: "鸡腿肉", category: "肉类", proteinPer100g: 20.2, carbsPer100g: 0, fatPer100g: 7.2, kcalPer100g: 146 },
  { id: "beef-lean", name: "瘦牛肉", category: "肉类", proteinPer100g: 21.3, carbsPer100g: 0, fatPer100g: 4.2, kcalPer100g: 123 },
  { id: "beef-ribeye", name: "牛小排/肋眼", category: "肉类", proteinPer100g: 18.5, carbsPer100g: 0, fatPer100g: 21.3, kcalPer100g: 266 },
  { id: "pork-tenderloin", name: "猪里脊", category: "肉类", proteinPer100g: 20.3, carbsPer100g: 0, fatPer100g: 3.5, kcalPer100g: 113 },
  { id: "salmon", name: "三文鱼", category: "肉类", proteinPer100g: 20.4, carbsPer100g: 0, fatPer100g: 12.5, kcalPer100g: 194 },
  { id: "shrimp", name: "虾仁", category: "肉类", proteinPer100g: 20.3, carbsPer100g: 0.2, fatPer100g: 0.7, kcalPer100g: 88 },
  { id: "tilapia", name: "罗非鱼/鲫鱼", category: "肉类", proteinPer100g: 18.3, carbsPer100g: 0, fatPer100g: 1.6, kcalPer100g: 88 },
  { id: "lamb-leg", name: "羊腿肉", category: "肉类", proteinPer100g: 20.2, carbsPer100g: 0, fatPer100g: 8.5, kcalPer100g: 157 },

  // ====== 蛋类 ======
  { id: "egg-whole", name: "鸡蛋(整)", category: "蛋类", proteinPer100g: 13.3, carbsPer100g: 1.5, fatPer100g: 9.5, kcalPer100g: 145 },
  { id: "egg-white", name: "蛋白", category: "蛋类", proteinPer100g: 11.0, carbsPer100g: 0.7, fatPer100g: 0.2, kcalPer100g: 49 },

  // ====== 主食 ======
  { id: "rice-white", name: "白米饭", category: "主食", proteinPer100g: 2.7, carbsPer100g: 28.0, fatPer100g: 0.3, kcalPer100g: 126 },
  { id: "rice-brown", name: "糙米饭", category: "主食", proteinPer100g: 2.8, carbsPer100g: 23.0, fatPer100g: 0.9, kcalPer100g: 112 },
  { id: "noodle-wheat", name: "面条(煮)", category: "主食", proteinPer100g: 3.4, carbsPer100g: 25.0, fatPer100g: 0.5, kcalPer100g: 118 },
  { id: "bread-wheat", name: "全麦面包", category: "主食", proteinPer100g: 8.5, carbsPer100g: 43.0, fatPer100g: 3.0, kcalPer100g: 233 },
  { id: "mantou", name: "馒头", category: "主食", proteinPer100g: 6.5, carbsPer100g: 47.0, fatPer100g: 1.0, kcalPer100g: 223 },
  { id: "sweet-potato", name: "红薯", category: "主食", proteinPer100g: 1.6, carbsPer100g: 20.1, fatPer100g: 0.1, kcalPer100g: 88 },
  { id: "corn", name: "玉米", category: "主食", proteinPer100g: 3.3, carbsPer100g: 19.0, fatPer100g: 1.2, kcalPer100g: 100 },
  { id: "oats", name: "燕麦(即食)", category: "主食", proteinPer100g: 13.5, carbsPer100g: 60.0, fatPer100g: 7.0, kcalPer100g: 357 },

  // ====== 蔬菜 ======
  { id: "broccoli", name: "西兰花", category: "蔬菜", proteinPer100g: 2.8, carbsPer100g: 4.0, fatPer100g: 0.4, kcalPer100g: 31 },
  { id: "spinach", name: "菠菜", category: "蔬菜", proteinPer100g: 2.6, carbsPer100g: 2.8, fatPer100g: 0.4, kcalPer100g: 25 },
  { id: "tomato", name: "番茄", category: "蔬菜", proteinPer100g: 0.9, carbsPer100g: 3.5, fatPer100g: 0.2, kcalPer100g: 19 },
  { id: "cucumber", name: "黄瓜", category: "蔬菜", proteinPer100g: 0.7, carbsPer100g: 2.5, fatPer100g: 0.1, kcalPer100g: 14 },
  { id: "lettuce", name: "生菜", category: "蔬菜", proteinPer100g: 1.2, carbsPer100g: 1.5, fatPer100g: 0.2, kcalPer100g: 13 },
  { id: "carrot", name: "胡萝卜", category: "蔬菜", proteinPer100g: 0.9, carbsPer100g: 8.8, fatPer100g: 0.2, kcalPer100g: 41 },
  { id: "bell-pepper", name: "彩椒", category: "蔬菜", proteinPer100g: 1.0, carbsPer100g: 4.6, fatPer100g: 0.2, kcalPer100g: 24 },

  // ====== 水果 ======
  { id: "banana", name: "香蕉", category: "水果", proteinPer100g: 1.1, carbsPer100g: 22.8, fatPer100g: 0.3, kcalPer100g: 98 },
  { id: "apple", name: "苹果", category: "水果", proteinPer100g: 0.3, carbsPer100g: 14.0, fatPer100g: 0.2, kcalPer100g: 59 },
  { id: "blueberry", name: "蓝莓", category: "水果", proteinPer100g: 0.7, carbsPer100g: 14.5, fatPer100g: 0.3, kcalPer100g: 63 },
  { id: "orange", name: "橙子", category: "水果", proteinPer100g: 0.9, carbsPer100g: 11.8, fatPer100g: 0.1, kcalPer100g: 52 },
  { id: "avocado", name: "牛油果", category: "水果", proteinPer100g: 2.0, carbsPer100g: 8.5, fatPer100g: 14.7, kcalPer100g: 174 },

  // ====== 乳制品 ======
  { id: "milk-whole", name: "全脂牛奶", category: "乳制品", proteinPer100g: 3.2, carbsPer100g: 4.9, fatPer100g: 3.5, kcalPer100g: 64 },
  { id: "milk-skim", name: "脱脂牛奶", category: "乳制品", proteinPer100g: 3.4, carbsPer100g: 5.0, fatPer100g: 0.1, kcalPer100g: 35 },
  { id: "yogurt-greek", name: "希腊酸奶", category: "乳制品", proteinPer100g: 10.0, carbsPer100g: 4.0, fatPer100g: 5.0, kcalPer100g: 101 },
  { id: "yogurt-plain", name: "原味酸奶", category: "乳制品", proteinPer100g: 3.5, carbsPer100g: 12.0, fatPer100g: 3.0, kcalPer100g: 89 },
  { id: "cheese-cheddar", name: "切达奶酪", category: "乳制品", proteinPer100g: 25.0, carbsPer100g: 1.3, fatPer100g: 33.0, kcalPer100g: 402 },

  // ====== 豆制品 ======
  { id: "tofu-firm", name: "老豆腐", category: "豆制品", proteinPer100g: 8.1, carbsPer100g: 2.0, fatPer100g: 4.2, kcalPer100g: 78 },
  { id: "soy-milk", name: "豆浆", category: "豆制品", proteinPer100g: 3.5, carbsPer100g: 2.8, fatPer100g: 1.8, kcalPer100g: 42 },
  { id: "edamame", name: "毛豆", category: "豆制品", proteinPer100g: 11.9, carbsPer100g: 9.9, fatPer100g: 5.2, kcalPer100g: 134 },

  // ====== 零食/补剂 ======
  { id: "protein-powder-whey", name: "乳清蛋白粉", category: "零食", proteinPer100g: 80.0, carbsPer100g: 7.0, fatPer100g: 3.0, kcalPer100g: 375 },
  { id: "almond", name: "杏仁", category: "零食", proteinPer100g: 21.2, carbsPer100g: 20.0, fatPer100g: 49.9, kcalPer100g: 614 },
  { id: "peanut-butter", name: "花生酱", category: "零食", proteinPer100g: 25.0, carbsPer100g: 20.0, fatPer100g: 50.0, kcalPer100g: 630 },
  { id: "dark-chocolate", name: "黑巧克力(85%)", category: "零食", proteinPer100g: 7.8, carbsPer100g: 22.0, fatPer100g: 46.0, kcalPer100g: 533 },
  { id: "olive-oil", name: "橄榄油", category: "零食", proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 99.9, kcalPer100g: 899 },
  { id: "honey", name: "蜂蜜", category: "零食", proteinPer100g: 0.3, carbsPer100g: 82.0, fatPer100g: 0, kcalPer100g: 329 },
  { id: "rice-cake", name: "米饼", category: "零食", proteinPer100g: 7.0, carbsPer100g: 80.0, fatPer100g: 2.0, kcalPer100g: 366 },
  { id: "sesame", name: "芝麻", category: "零食", proteinPer100g: 19.1, carbsPer100g: 18.3, fatPer100g: 52.7, kcalPer100g: 624 },
  { id: "nuts-mixed", name: "坚果(混合)", category: "零食", proteinPer100g: 16.9, carbsPer100g: 20, fatPer100g: 55.4, kcalPer100g: 646 },
];

/** Fast lookup map: foodId → FoodItem */
const FOOD_MAP: Record<string, FoodItem> = {};
FOOD_DATABASE.forEach((f) => {
  FOOD_MAP[f.id] = f;
});

/** Get a food by its ID */
export function getFoodById(id: string): FoodItem | undefined {
  return FOOD_MAP[id];
}

/** Search foods by name or category (fuzzy match) */
export function searchFoods(query: string): FoodItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOOD_DATABASE.slice(0, 15); // show first 15 when empty

  const results = FOOD_DATABASE.filter((f) => {
    return (
      f.name.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
    );
  });

  return results.slice(0, 12); // limit to 12 results
}

/** Get foods grouped by category */
export function getFoodsByCategory(): Record<FoodCategory, FoodItem[]> {
  const groups: Record<string, FoodItem[]> = {};
  FOOD_DATABASE.forEach((f) => {
    if (!groups[f.category]) groups[f.category] = [];
    groups[f.category].push(f);
  });
  return groups;
}
