import React, { useState } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { 
  ChevronLeft, 
  HelpCircle, 
  Search, 
  ChevronDown, 
  MessageSquare, 
  Mail, 
  Phone, 
  FileText, 
  Youtube, 
  Send
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const HelpSupport = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: ''
  });
  
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };
  
  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setContactForm(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: 'Message Sent',
      description: 'We\'ve received your message and will respond shortly.',
    });
    setContactForm({
      name: '',
      email: '',
      message: ''
    });
  };
  
  // Example FAQ data
  const faqItems = [
    {
      question: 'How do I create a new workout routine?',
      answer: 'To create a new workout routine, navigate to the Workouts tab, click on "Create Workout," and follow the step-by-step instructions to add exercises, sets, and reps to your routine.'
    },
    {
      question: 'How do I track my nutrition information?',
      answer: 'You can track your nutrition by going to the Nutrition tab. From there, you can scan food barcodes, search for foods, or manually enter your meals. The app will automatically calculate your calories and macronutrients.'
    },
    {
      question: 'Can I connect my fitness wearable to the app?',
      answer: 'Yes! You can connect various health platforms including Apple Health, Garmin, Android Health, Whoop, and Oura Ring. Go to your Profile, select Integrations, and follow the instructions for your specific device.'
    },
    {
      question: 'How do I set up medication reminders?',
      answer: 'To set up medication reminders, go to the Medications tab, add your medication details, and create a schedule. You can set specific times for reminders and track when you\'ve taken your medications.'
    },
    {
      question: 'How can I cancel my subscription?',
      answer: 'To cancel your subscription, go to your Profile, select Account Settings, then navigate to the Subscription section. From there, you can manage or cancel your subscription. Note that cancellations will take effect at the end of your current billing period.'
    }
  ];
  
  return (
    <div className="p-4 space-y-6 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center mb-6">
        <Link href="/profile">
          <Button variant="ghost" size="sm" className="mr-2 h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Help & Support</h1>
        </div>
      </div>
      
      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search for help topics..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>Find quick answers to common questions</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item, index) => (
              <AccordionItem value={`item-${index}`} key={index}>
                <AccordionTrigger className="text-left hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Support Resources</CardTitle>
          <CardDescription>Guides and tutorials to help you get the most out of Strive</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button variant="outline" className="flex justify-start items-center gap-3 h-auto py-3">
              <FileText className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">User Guide</div>
                <div className="text-sm text-muted-foreground">Comprehensive app documentation</div>
              </div>
            </Button>
            
            <Button variant="outline" className="flex justify-start items-center gap-3 h-auto py-3">
              <Youtube className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">Video Tutorials</div>
                <div className="text-sm text-muted-foreground">Step-by-step visual guides</div>
              </div>
            </Button>
            
            <Button variant="outline" className="flex justify-start items-center gap-3 h-auto py-3">
              <MessageSquare className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">Community Forum</div>
                <div className="text-sm text-muted-foreground">Connect with other users</div>
              </div>
            </Button>
            
            <Button variant="outline" className="flex justify-start items-center gap-3 h-auto py-3">
              <FileText className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">Workout Library</div>
                <div className="text-sm text-muted-foreground">Browse exercise techniques</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Contact Support</CardTitle>
          <CardDescription>Still need help? Reach out to our support team</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                name="name"
                value={contactForm.name}
                onChange={handleFormChange}
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={contactForm.email}
                onChange={handleFormChange}
                required
              />
            </div>
            <div>
              <Label htmlFor="message">How can we help?</Label>
              <Textarea
                id="message"
                name="message"
                value={contactForm.message}
                onChange={handleFormChange}
                rows={4}
                required
              />
            </div>
            <Button type="submit" className="w-full flex items-center justify-center gap-2">
              <Send className="h-4 w-4" />
              <span>Send Message</span>
            </Button>
          </form>
          
          <div className="pt-4 border-t">
            <p className="text-sm font-medium">Other ways to reach us:</p>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-primary" />
                <span>support@strive-fitness.com</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-primary" />
                <span>1-800-STRIVE-FIT (1-800-787-4834)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HelpSupport;