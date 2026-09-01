// Marker categories, in the order they appear everywhere in the app (Reports,
// Trends browser, Add-reading picker). `key` is what markers reference.
export const CATEGORIES = [
  { key: 'vitals', name: 'Vitals', short: 'Vitals', icon: 'HeartPulse' },
  { key: 'lipids', name: 'Lipid Profile', short: 'Lipids', icon: 'Droplets' },
  { key: 'glycemic', name: 'Blood Sugar', short: 'Sugar', icon: 'Candy' },
  { key: 'blood', name: 'Complete Blood Count', short: 'CBC', icon: 'TestTube' },
  { key: 'kidney', name: 'Kidney & Electrolytes', short: 'Kidney', icon: 'Filter' },
  { key: 'liver', name: 'Liver Function', short: 'Liver', icon: 'Activity' },
  { key: 'thyroid', name: 'Thyroid', short: 'Thyroid', icon: 'Gauge' },
  { key: 'vitamins', name: 'Vitamins & Minerals', short: 'Vitamins', icon: 'Pill' },
  { key: 'other', name: 'Other Markers', short: 'Other', icon: 'FlaskConical' },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export function categoryName(key) {
  return CATEGORIES.find((c) => c.key === key)?.name ?? 'Other Markers';
}
