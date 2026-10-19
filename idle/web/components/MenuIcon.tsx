import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { TShirtIcon } from '@phosphor-icons/react/dist/csr/TShirt';
import { BackpackIcon } from '@phosphor-icons/react/dist/csr/Backpack';
import { MagicWandIcon } from '@phosphor-icons/react/dist/csr/MagicWand';
import { MapTrifoldIcon } from '@phosphor-icons/react/dist/csr/MapTrifold';
import { StorefrontIcon } from '@phosphor-icons/react/dist/csr/Storefront';
import { ScrollIcon } from '@phosphor-icons/react/dist/csr/Scroll';
import { PawPrintIcon } from '@phosphor-icons/react/dist/csr/PawPrint';
import { UsersThreeIcon } from '@phosphor-icons/react/dist/csr/UsersThree';
import { TrophyIcon } from '@phosphor-icons/react/dist/csr/Trophy';
import { ChatCircleTextIcon } from '@phosphor-icons/react/dist/csr/ChatCircleText';
import { ArrowsClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
import { UserCircleIcon } from '@phosphor-icons/react/dist/csr/UserCircle';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut';
import { BookOpenTextIcon } from '@phosphor-icons/react/dist/csr/BookOpenText';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { CastleTurretIcon } from '@phosphor-icons/react/dist/csr/CastleTurret';
import { ShieldCheckIcon } from '@phosphor-icons/react/dist/csr/ShieldCheck';

const icons = {
  stats: SlidersHorizontalIcon, equipment: TShirtIcon, inventory: BackpackIcon,
  skills: MagicWandIcon, world: MapTrifoldIcon, shop: StorefrontIcon,
  quests: ScrollIcon, bestiary: PawPrintIcon, classes: UsersThreeIcon,
  challenges: TrophyIcon, journal: ChatCircleTextIcon, reset: ArrowsClockwiseIcon,
  account: UserCircleIcon, logout: SignOutIcon, classic: ArrowSquareOutIcon,
  book: BookOpenTextIcon, identify: MagnifyingGlassIcon, city: CastleTurretIcon,
  admin: ShieldCheckIcon,
};

export default function MenuIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] ?? BookOpenTextIcon;
  return <Icon className="menu-icon" size={size} weight="duotone" aria-hidden="true" focusable="false" />;
}
