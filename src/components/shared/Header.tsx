'use client';

import { Bell, Menu, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onOpenMenu: () => void;
}

export function Header({ onOpenMenu }: HeaderProps) {
  return (
    <header className="border-b bg-white px-4 py-4 md:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="打开菜单"
            onClick={onOpenMenu}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">欢迎回来</h2>
            <p className="text-sm text-gray-500">开始您的AI创作之旅</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
