import { TextInput, PasswordInput, Checkbox, 
  Button, Group, Space, Center, Anchor, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import Link from 'next/link';
import { supabaseClient } from '@supabase/auth-helpers-nextjs';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { pageVisibiltyState } from '../recoil/pageVisibility.recoil';
import { userState } from '../recoil/user.recoil';

export default function Login() {
  const router = useRouter();
  const [user] = useRecoilState(userState);
  const setUserState = useSetRecoilState(userState);
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);
  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      rememberMe: false,
    },

    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
    },
  });

  useEffect(() => {
    if (!user) {
      setIsPageVisible(true);
    }
    else {
      router.push('/');
      setIsPageVisible(false);
    }
  }, [user])

  const SupaBaseLogin = async (email: string, password: string) => {
    let { error } = await supabaseClient.auth.signIn({
      email: email,
      password: password
    })
  
    if(error) {
      alert(error.message);
      return;
    }
    else {
      // @ts-ignore
      setUserState({});
      router.push('/');
      setIsPageVisible(false);
      console.log("successful login");
    }
  };

  return (
    <Center className="flex flex-col w-full h-full" mx="auto">
      <Text size="xl" mt="md">Hello, Whirled!</Text>
      <Text size="xs">Welcome back to the brave new whirled!</Text>

      <form className="w-72" onSubmit={form.onSubmit((values) => SupaBaseLogin(values.email, values.password))}>
        <Text size="sm" mt="md">Email</Text>
        <TextInput required placeholder="your@email.com"
          {...form.getInputProps('email')}
        />

        <Text size="sm" mt="md">Password</Text>
        <PasswordInput required placeholder="Your password"
          {...form.getInputProps('password')}
        />

        <Group position="apart" mt="md">
          <Checkbox label="Remember me" />
          <Anchor
            onClick={(event: { preventDefault: () => void; }) => event.preventDefault()}
            href="#"
            size="sm"
          >
            Forgot your password?
          </Anchor>
        </Group>

        <Group position="center" mt="md">
          <Space h="md" />
          <Button fullWidth type="submit">Login</Button>
        </Group>
        <Group position="center" mt="md" className="text-sm">
          {"Don't have an account?"}
          <Link href="signup"><Anchor>Sign Up</Anchor></Link>
        </Group>
      </form>
    </Center>
  );
}