import { Group, Tabs } from "@mantine/core";
import { IconBasket, IconArmchair2, IconBrandAppleArcade, 
  IconDoor, IconUser, IconWorld } from "@tabler/icons-react";
import Link from "next/link";
import AccountHeader from "./accountHeader";

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
              <Tabs.Tab value="me" icon={<IconUser size={15}/>}>
                <Link href={"/profile"} className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>
                  Me
                </Link>
                <span className="text-transparent">Me</span>
              </Tabs.Tab>

              <Tabs.Tab value="stuff" icon={<IconArmchair2 size={15}/>}>
                <Link href={"/stuff"} className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>
                  Stuff
                </Link>
                <span className="text-transparent">Stuff</span>
              </Tabs.Tab>

              <Tabs.Tab value="games" icon={<IconBrandAppleArcade size={15}/>}>
                <Link href={"/games"} className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>
                  Games
                </Link>
                <span className="text-transparent">Games</span>
              </Tabs.Tab>
              
              <Tabs.Tab value="rooms" icon={<IconDoor size={15}/>}>
                <Link href={"/rooms"} className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>
                  Rooms
                </Link>
                <span className="text-transparent">Rooms</span>
              </Tabs.Tab>

              <Tabs.Tab value="groups" icon={<IconWorld size={15}/>}>
                <Link href={"/groups"} className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>
                  Groups
                </Link>
                <span className="text-transparent">Groups</span>
              </Tabs.Tab>

              <Tabs.Tab value="shop" icon={<IconBasket size={15}/>}>
                <Link href={"/shop"} className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>
                  Shop
                </Link>
                <span className="text-transparent">Shop</span>
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Group className="p-1" position="center">
            <AccountHeader/>
          </Group>
        </div>
      </Group>
    </div>
  );
}