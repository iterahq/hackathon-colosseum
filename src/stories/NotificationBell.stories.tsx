import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotificationBellIcon, NotificationList } from '@/components/data-layer/NotificationBell';
import { notifications } from './dataLayerFixtures';

const meta: Meta<typeof NotificationBellIcon> = {
  title: 'DataLayer/NotificationBell',
  component: NotificationBellIcon,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof NotificationBellIcon>;

export const IconWithUnread: Story = { args: { unreadCount: 3 } };

export const IconEmpty: Story = { args: { unreadCount: 0 } };

// 99+ é onde o contador estoura a bolha; vale ter a story pro designer ver.
export const IconOverflow: Story = { args: { unreadCount: 128 } };

export const List: StoryObj<typeof NotificationList> = {
  render: () => (
    <div style={{ width: 360 }}>
      <NotificationList summary={notifications} />
    </div>
  ),
};

export const ListAllRead: StoryObj<typeof NotificationList> = {
  render: () => (
    <div style={{ width: 360 }}>
      <NotificationList
        summary={{ unreadCount: 0, items: notifications.items.map((i) => ({ ...i, read: true })) }}
      />
    </div>
  ),
};

export const ListEmpty: StoryObj<typeof NotificationList> = {
  render: () => (
    <div style={{ width: 360 }}>
      <NotificationList summary={{ unreadCount: 0, items: [] }} />
    </div>
  ),
};
