'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Image,
  Images,
  Layout,
  Workflow,
  FolderOpen,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';

const navigation = [
  { name: '文生图', href: '/text-to-image', icon: Image },
  { name: '图生图', href: '/image-to-image', icon: Images },
  { name: '无限画布', href: '/canvas', icon: Layout },
  { name: '工作流', href: '/workflow', icon: Workflow },
  { name: '营销助手', href: '/marketing', icon: Sparkles },
  { name: '资源库', href: '/assets', icon: FolderOpen },
  { name: '设置', href: '/settings', icon: Settings },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-white transition-transform duration-200 md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          type="button"
          aria-label="关闭菜单"
          onClick={onClose}
          className="absolute right-3 top-6 rounded-md p-1 text-gray-500 hover:bg-gray-100 md:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6">
          <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-2xl font-bold text-transparent">
            电商AI工作台
          </h1>
          <p className="mt-1 text-sm text-gray-500">AI设计助手</p>
        </div>

        <nav className="flex-1 space-y-1 px-4">
          {navigation.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <div className="text-xs text-gray-500">
            <div>Phase 1 - Week 2 完成</div>
            <div className="mt-1">v0.1.0</div>
          </div>
        </div>
      </aside>
    </>
  );
}
