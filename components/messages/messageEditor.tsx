import { Button, MultiSelect, ActionIcon, Textarea, TextInput } from "@mantine/core";
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { IconDots, IconSend, IconUser } from "@tabler/icons-react";
import { useState } from "react";
import { GetRecipients, Message } from "../../pages/messages";
import { User } from "../../recoil/user.recoil";

type Props = {
  isModal?: boolean,
  user: User,
  recipient: string,
  group_id?: number | null,
  onClose?: () => void, 
  addMessage: (msg: Message) => void
}

export default function MessageEditor({isModal=false, user, recipient, group_id, onClose, addMessage}: Props) {
  const [recipients, setRecipients] = useState<string[]>([user.username, recipient]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const supabaseClient = createBrowserSupabaseClient();

  async function SendMessage() {
    // send_message is for messaging an existing message group
    // compose_message is for creating and messaging a new message group
    const { data: sqlMessages } = await supabaseClient.rpc((group_id ? 'send_message' : 'compose_message'), 
    (group_id ? {
      _group_id: group_id,
      body: content,
    } : {
      usernames: recipients,
      subject: subject,
      body: content,
    }));

    if(!sqlMessages) {
      alert('error sending message');
      console.log(recipients, subject, content);
    }
    else {
      let recievingUser = GetRecipients(sqlMessages[0]);

      addMessage({
        id: (!group_id ? sqlMessages[0]._group_id : sqlMessages[0].msg_id),
        title: subject,
        content: content,
        content_username: user.username,
        content_nickname: user.nickname,
        content_avatar: user.avatar_url,
        username: recievingUser.username,
        nickname: recievingUser.nickname,
        avatar: recievingUser.avatar,
        created_at: new Date()
      });
      setSubject('');
      setContent('');
    }

    if(onClose) onClose();
  }

  return (<div className="flex flex-col space-y-4">
    {isModal && <>
      <MultiSelect maxSelectedValues={1} icon={<IconUser />} readOnly
        value={[recipient]} onChange={setRecipients}
        data={recipient ? [{ value: recipient, label: `@${recipient}` }] : []}/>
      <TextInput placeholder="Subject" value={subject} 
        onChange={(event) => setSubject(event.currentTarget.value)}/>
    </>}

    <div className='flex flex-row w-full space-x-2'>
      <Textarea placeholder="Your message here" value={content} className='grow'
        onChange={(event) => setContent(event.currentTarget.value)} autosize minRows={(isModal ? 4 : 2)}/>
      {!isModal && <div className='flex flex-col justify-between'>
        <ActionIcon variant="filled" color="blue" onClick={() => {SendMessage();}}><IconSend size={16}/></ActionIcon>
        <ActionIcon variant="subtle" color="blue"><IconDots size={16}/></ActionIcon>
      </div>
      }
    </div>
    {isModal && <Button onClick={() => {SendMessage();}}>
      Send
    </Button>}
  </div>);
}