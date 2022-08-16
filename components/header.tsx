import { Avatar, Group, Menu, Tabs, UnstyledButton } from "@mantine/core";
import { IconBasket, IconArmchair2, IconBrandAppleArcade, 
  IconDoor, IconUser, IconWorld, IconLogout } from "@tabler/icons";
import { supabaseClient } from '@supabase/auth-helpers-nextjs';

export default function Header() {
  return (
    <div className="flex-initial">
      <Group position="apart" className="border-b border-gray-700">
        <div className="pl-2">
          Whirled 2.0
        </div>
        <div className="flex flex-row space-x-4 pr-2">
          <Tabs className="self-end">
            <Tabs.List position="right">
              <Tabs.Tab value="me" icon={<IconUser size={15} />}>Me</Tabs.Tab>
              <Tabs.Tab value="stuff" icon={<IconArmchair2 size={15} />}>Stuff</Tabs.Tab>
              <Tabs.Tab value="games" icon={<IconBrandAppleArcade size={15} />}>Games</Tabs.Tab>
              <Tabs.Tab value="rooms" icon={<IconDoor size={15} />}>Rooms</Tabs.Tab>
              <Tabs.Tab value="group" icon={<IconWorld size={15} />}>Groups</Tabs.Tab>
              <Tabs.Tab value="shop" icon={<IconBasket size={15} />}>Shop</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Group className="p-1" position="center">
            <Menu position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Avatar color="blue" radius="xl">
                    <IconUser size={24} />
                  </Avatar>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Application</Menu.Label>
                <Menu.Item icon={<IconLogout size={14}/>} onClick={() => supabaseClient.auth.signOut()}>Logout</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </div>
      </Group>
    </div>
  );
}