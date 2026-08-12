'use client';

import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { FileSearch, FileText, Image, LayoutGrid } from 'lucide-react';

interface OutputOptionsProps {
  outputs: {
    analysis: boolean;
    copywriting: boolean;
    mainPrompts: boolean;
    detailPrompts: boolean;
  };
  onOutputsChange: (outputs: {
    analysis: boolean;
    copywriting: boolean;
    mainPrompts: boolean;
    detailPrompts: boolean;
  }) => void;
}

export function OutputOptions({ outputs, onOutputsChange }: OutputOptionsProps) {
  const handleToggle = (key: keyof typeof outputs) => {
    onOutputsChange({
      ...outputs,
      [key]: !outputs[key],
    });
  };

  const options = [
    {
      key: 'analysis' as const,
      icon: FileSearch,
      label: '产品分析报告',
      description: 'AI识别产品品类、卖点、参数，生成结构化分析报告',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      key: 'copywriting' as const,
      icon: FileText,
      label: '电商文案',
      description: '标题、卖点、商品描述、SEO关键词等完整文案体系',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      key: 'mainPrompts' as const,
      icon: Image,
      label: '主图提示词（6+2张）',
      description: '基于31份SOP生成主图中文提示词，可直接用于AI生图',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      key: 'detailPrompts' as const,
      icon: LayoutGrid,
      label: '详情页提示词（6-10页）',
      description: '按品类适配不同页面结构，高设计感、高信息密度',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  const selectedCount = Object.values(outputs).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-lg">选择需要生成的内容</Label>
        <p className="text-sm text-muted-foreground mt-1">
          已选择 {selectedCount} 项，支持同时生成多种类型
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {options.map((option) => {
          const Icon = option.icon;
          const isChecked = outputs[option.key];

          return (
            <Card
              key={option.key}
              className={`p-4 cursor-pointer transition-all ${
                isChecked
                  ? 'border-2 border-blue-500 shadow-md'
                  : 'border-2 border-transparent hover:border-gray-300'
              }`}
              onClick={() => handleToggle(option.key)}
            >
              <div className="flex items-start space-x-3">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => handleToggle(option.key)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className={`p-2 rounded-lg ${option.bgColor}`}>
                      <Icon className={`h-5 w-5 ${option.color}`} />
                    </div>
                    <h3 className="font-semibold">{option.label}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 提示信息 */}
      <Card className="p-4 bg-yellow-50 border-yellow-200">
        <p className="text-sm font-medium text-yellow-900 mb-2">
          💡 生成时间说明
        </p>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• 产品分析：约10-20秒</li>
          <li>• 电商文案：约15-30秒</li>
          <li>• 主图提示词：约30-60秒</li>
          <li>• 详情页提示词：约40-80秒</li>
          <li>• 全部生成：约2-3分钟</li>
        </ul>
      </Card>
    </div>
  );
}
