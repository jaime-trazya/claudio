import {
  ArrowLeftRight, Baby, Beer, Cigarette, Dices, HandCoins, Banknote, Bike, BookOpen, Briefcase, Building, Car, CircleParking, Coffee, CreditCard, Droplet,
  Dumbbell, Ellipsis, Film, Flame, Fuel, Gamepad2, Gift, Globe, GraduationCap, Hammer, HeartPulse, House, Key, Landmark,
  Laptop, Music, Package, PawPrint, Percent, PiggyBank, Pill, Plane, Plus, Receipt, Repeat, Scissors, Shield, Shirt,
  ShoppingBag, ShoppingBasket, Smartphone, Sofa, Star, Stethoscope, Sun, Tag, Ticket, TrainFront, TreePine, TrendingUp,
  Umbrella, Undo2, Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from 'lucide-react'

/** Iconos disponibles para las categorías (se guardan por nombre, ver iconNames.ts) */
const ICONS: Record<string, LucideIcon> = {
  home: House, key: Key, zap: Zap, droplet: Droplet, flame: Flame, wifi: Wifi, building: Building, shield: Shield,
  basket: ShoppingBasket, utensils: Utensils, coffee: Coffee, bike: Bike, car: Car, fuel: Fuel, train: TrainFront,
  parking: CircleParking, wrench: Wrench, bag: ShoppingBag, shirt: Shirt, laptop: Laptop, sofa: Sofa, package: Package,
  ticket: Ticket, repeat: Repeat, plane: Plane, film: Film, dumbbell: Dumbbell, heart: HeartPulse, pill: Pill,
  stethoscope: Stethoscope, book: BookOpen, landmark: Landmark, percent: Percent, receipt: Receipt, phone: Smartphone,
  banknote: Banknote, dots: Ellipsis, briefcase: Briefcase, undo: Undo2, trending: TrendingUp, plus: Plus,
  arrows: ArrowLeftRight, gift: Gift, paw: PawPrint, baby: Baby, music: Music, gamepad: Gamepad2, scissors: Scissors,
  graduation: GraduationCap, piggy: PiggyBank, wallet: Wallet, card: CreditCard, tag: Tag, star: Star, globe: Globe,
  umbrella: Umbrella, sun: Sun, tree: TreePine, hammer: Hammer,
  beer: Beer, cigarette: Cigarette, dice: Dices, handcoins: HandCoins,
}

export function CategoryIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Tag
  return <Icon size={size} strokeWidth={1.8} aria-hidden />
}
