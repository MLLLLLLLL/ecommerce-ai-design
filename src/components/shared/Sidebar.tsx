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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r flex flex-col">
      <div className="p-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          电商AI工作台
        </h1>
        <p className="text-sm text-gray-500 mt-1">AI设计助手</p>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <div className="text-xs text-gray-500">
          <div>Phase 1 - Week 2 完成</div>
          <div className="mt-1">v0.1.0</div>
        </div>
      </div>
    </aside>
  );
}
