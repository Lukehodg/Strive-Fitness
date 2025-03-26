import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { MedicationIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarIcon, CheckCircle, Clock, Edit, Plus, Trash } from "lucide-react";

// Define types for our medication data
interface Medication {
  id: number;
  userId: number;
  name: string;
  type: string;
  dosage: string;
  frequency: string;
  startDate: string | Date;
  endDate: string | Date | null;
  notes: string | null;
  isActive: boolean | null;
}

interface MedicationSchedule {
  id: number;
  medicationId: number;
  scheduledTime: string | Date;
  takenTime: string | Date | null;
  isTaken: boolean | null;
  skipped: boolean | null;
  notes: string | null;
  injectionSite: string | null;
}

// Define query response types
type MedicationsResponse = Medication[];
type SchedulesResponse = MedicationSchedule[];

// Define medication types
const medicationTypes = [
  "tablet",
  "capsule",
  "liquid",
  "powder",
  "injection",
  "topical",
  "patch",
  "inhaler",
  "other"
];

// Define injection sites
const injectionSites = [
  "buttocks",
  "thigh",
  "deltoid",
  "abdomen",
  "ventrogluteal",
  "dorsogluteal",
  "vastus lateralis",
  "rectus femoris",
  "other"
];

// Create schema for medication form
const medicationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  dosage: z.string().min(1, "Dosage is required"),
  frequency: z.string().min(1, "Frequency is required"),
  startDate: z.date(),
  endDate: z.date().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean().default(true)
});

// Create schema for medication schedule form
const scheduleSchema = z.object({
  medicationId: z.number(),
  scheduledTime: z.date(),
  notes: z.string().nullable(),
  injectionSite: z.string().nullable()
});

export default function MedicationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("active");
  const [isMedicationDialogOpen, setIsMedicationDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);

  // Create form for adding/editing medications
  const medicationForm = useForm<z.infer<typeof medicationSchema>>({
    resolver: zodResolver(medicationSchema),
    defaultValues: {
      name: "",
      type: "tablet",
      dosage: "",
      frequency: "",
      startDate: new Date(),
      endDate: null,
      notes: "",
      isActive: true
    }
  });

  // Create form for adding schedules
  const scheduleForm = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      medicationId: 0,
      scheduledTime: new Date(),
      notes: "",
      injectionSite: null
    }
  });

  // Query for medications
  const { data: medications = [], isLoading: isMedicationsLoading } = useQuery<MedicationsResponse>({
    queryKey: ['/api/users/1/medications'],
    queryFn: getQueryFn({
      on401: "throw"
    })
  });

  // Query for today's medication schedules
  const today = new Date();
  const formattedDate = format(today, 'yyyy-MM-dd');
  
  const { data: schedules = [], isLoading: isSchedulesLoading } = useQuery<SchedulesResponse>({
    queryKey: ['/api/users/1/medication-schedules', formattedDate],
    queryFn: getQueryFn({
      on401: "throw"
    })
  });

  // Mutation to add a medication
  const addMedicationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof medicationSchema>) => {
      return await apiRequest('POST', '/api/medications', {
        ...data,
        userId: 1
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/medications'] });
      setIsMedicationDialogOpen(false);
      medicationForm.reset();
      toast({
        title: "Success",
        description: "Medication added successfully",
      });
    },
    onError: (error) => {
      console.error('Error adding medication:', error);
      toast({
        title: "Error",
        description: "Failed to add medication",
        variant: "destructive"
      });
    }
  });

  // Mutation to update a medication
  const updateMedicationMutation = useMutation({
    mutationFn: async (data: { id: number; medication: Partial<Medication> }) => {
      return await apiRequest('PATCH', `/api/medications/${data.id}`, data.medication);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/medications'] });
      setIsMedicationDialogOpen(false);
      medicationForm.reset();
      toast({
        title: "Success",
        description: "Medication updated successfully",
      });
    },
    onError: (error) => {
      console.error('Error updating medication:', error);
      toast({
        title: "Error",
        description: "Failed to update medication",
        variant: "destructive"
      });
    }
  });

  // Mutation to add a medication schedule
  const addScheduleMutation = useMutation({
    mutationFn: async (data: z.infer<typeof scheduleSchema>) => {
      return await apiRequest('POST', '/api/medication-schedules', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/medication-schedules'] });
      setIsScheduleDialogOpen(false);
      scheduleForm.reset();
      toast({
        title: "Success",
        description: "Schedule added successfully",
      });
    },
    onError: (error) => {
      console.error('Error adding schedule:', error);
      toast({
        title: "Error",
        description: "Failed to add schedule",
        variant: "destructive"
      });
    }
  });

  // Mutation to mark a schedule as taken
  const markScheduleTakenMutation = useMutation({
    mutationFn: async (data: { id: number; isTaken: boolean }) => {
      return await apiRequest('PATCH', `/api/medication-schedules/${data.id}`, {
        isTaken: data.isTaken,
        takenTime: data.isTaken ? new Date() : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/medication-schedules'] });
      toast({
        title: "Success",
        description: "Schedule updated successfully",
      });
    },
    onError: (error) => {
      console.error('Error updating schedule:', error);
      toast({
        title: "Error",
        description: "Failed to update schedule",
        variant: "destructive"
      });
    }
  });

  // Handle medication form submission
  const handleMedicationSubmit = (values: z.infer<typeof medicationSchema>) => {
    if (selectedMedication) {
      updateMedicationMutation.mutate({
        id: selectedMedication.id,
        medication: values
      });
    } else {
      addMedicationMutation.mutate(values);
    }
  };

  // Handle schedule form submission
  const handleScheduleSubmit = (values: z.infer<typeof scheduleSchema>) => {
    addScheduleMutation.mutate(values);
  };

  // Open the medication form dialog for editing
  const handleEditMedication = (medication: Medication) => {
    setSelectedMedication(medication);
    medicationForm.reset({
      name: medication.name,
      type: medication.type,
      dosage: medication.dosage,
      frequency: medication.frequency,
      startDate: new Date(medication.startDate),
      endDate: medication.endDate ? new Date(medication.endDate) : null,
      notes: medication.notes,
      isActive: medication.isActive === null ? true : medication.isActive
    });
    setIsMedicationDialogOpen(true);
  };

  // Open the schedule form dialog
  const handleAddSchedule = (medication: Medication) => {
    scheduleForm.reset({
      medicationId: medication.id,
      scheduledTime: new Date(),
      notes: "",
      injectionSite: medication.type === "injection" ? "thigh" : null
    });
    setIsScheduleDialogOpen(true);
  };

  // Filter active or all medications
  const filteredMedications = medications.filter((med: Medication) => 
    activeTab === "active" ? med.isActive !== false : true
  );

  // Group schedules by medication
  const groupedSchedules: Record<number, MedicationSchedule[]> = {};
  schedules.forEach((schedule: MedicationSchedule) => {
    if (!groupedSchedules[schedule.medicationId]) {
      groupedSchedules[schedule.medicationId] = [];
    }
    groupedSchedules[schedule.medicationId].push(schedule);
  });

  return (
    <div className="container py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <MedicationIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Medications & Supplements</h1>
        </div>
        <Button onClick={() => {
          setSelectedMedication(null);
          medicationForm.reset({
            name: "",
            type: "tablet",
            dosage: "",
            frequency: "",
            startDate: new Date(),
            endDate: null,
            notes: "",
            isActive: true
          });
          setIsMedicationDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Medication
        </Button>
      </div>

      <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active">Active Medications</TabsTrigger>
          <TabsTrigger value="all">All Medications</TabsTrigger>
          <TabsTrigger value="schedule">Today's Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="pt-4">
          {isMedicationsLoading ? (
            <div className="flex justify-center">Loading active medications...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMedications?.length ? (
                filteredMedications.map((medication: Medication) => (
                  <MedicationCard 
                    key={medication.id} 
                    medication={medication} 
                    onEdit={() => handleEditMedication(medication)}
                    onAddSchedule={() => handleAddSchedule(medication)}
                    schedules={groupedSchedules[medication.id] || []}
                    onMarkTaken={(scheduleId, isTaken) => markScheduleTakenMutation.mutate({ id: scheduleId, isTaken })}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">No active medications found</p>
                  <Button variant="outline" onClick={() => setIsMedicationDialogOpen(true)} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Medication
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="pt-4">
          {isMedicationsLoading ? (
            <div className="flex justify-center">Loading medications...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {medications?.length ? (
                medications.map((medication: Medication) => (
                  <MedicationCard 
                    key={medication.id} 
                    medication={medication} 
                    onEdit={() => handleEditMedication(medication)}
                    onAddSchedule={() => handleAddSchedule(medication)}
                    schedules={groupedSchedules[medication.id] || []}
                    onMarkTaken={(scheduleId, isTaken) => markScheduleTakenMutation.mutate({ id: scheduleId, isTaken })}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">No medications found</p>
                  <Button variant="outline" onClick={() => setIsMedicationDialogOpen(true)} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Medication
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="schedule" className="pt-4">
          {isSchedulesLoading ? (
            <div className="flex justify-center">Loading today's schedule...</div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">{format(today, 'EEEE, MMMM do, yyyy')}</h2>
              
              <div className="space-y-4">
                {schedules?.length ? (
                  schedules.map((schedule: MedicationSchedule) => {
                    const medication = medications.find((med: Medication) => med.id === schedule.medicationId);
                    return (
                      <ScheduleItem 
                        key={schedule.id}
                        schedule={schedule}
                        medication={medication}
                        onMarkTaken={(isTaken) => markScheduleTakenMutation.mutate({ id: schedule.id, isTaken })}
                      />
                    );
                  })
                ) : (
                  <div className="text-center py-10">
                    <p className="text-muted-foreground">No medications scheduled for today</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Medication Dialog */}
      <Dialog open={isMedicationDialogOpen} onOpenChange={setIsMedicationDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{selectedMedication ? 'Edit Medication' : 'Add New Medication'}</DialogTitle>
            <DialogDescription>
              Enter the details of your medication or supplement.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...medicationForm}>
            <form onSubmit={medicationForm.handleSubmit(handleMedicationSubmit)} className="space-y-4">
              <FormField
                control={medicationForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Vitamin D3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {medicationTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="dosage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dosage</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 1000mg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Once daily" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className="w-full pl-3 text-left font-normal"
                          >
                            {field.value ? (
                              format(field.value, "MMMM d, yyyy")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date (Optional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className="w-full pl-3 text-left font-normal"
                          >
                            {field.value ? (
                              format(field.value, "MMMM d, yyyy")
                            ) : (
                              <span>No end date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                          disabled={(date) => {
                            const startDate = medicationForm.getValues("startDate");
                            return date < startDate;
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Take with food" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        This medication is currently being taken
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="submit">
                  {selectedMedication ? "Update Medication" : "Add Medication"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Schedule</DialogTitle>
            <DialogDescription>
              Add a schedule for this medication.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...scheduleForm}>
            <form onSubmit={scheduleForm.handleSubmit(handleScheduleSubmit)} className="space-y-4">
              <FormField
                control={scheduleForm.control}
                name="scheduledTime"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Schedule Time</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className="w-full pl-3 text-left font-normal"
                          >
                            {field.value ? (
                              format(field.value, "MMMM d, yyyy h:mm a")
                            ) : (
                              <span>Pick a date and time</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              const currentDate = field.value;
                              const hours = currentDate.getHours();
                              const minutes = currentDate.getMinutes();
                              date.setHours(hours, minutes);
                              field.onChange(date);
                            }
                          }}
                          initialFocus
                        />
                        <div className="border-t border-border p-3 flex justify-between">
                          <Select 
                            defaultValue={field.value.getHours().toString()}
                            onValueChange={(value) => {
                              const date = new Date(field.value);
                              date.setHours(parseInt(value));
                              field.onChange(date);
                            }}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue placeholder="Hour" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {i.toString().padStart(2, '0')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-xl">:</span>
                          <Select 
                            defaultValue={field.value.getMinutes().toString()}
                            onValueChange={(value) => {
                              const date = new Date(field.value);
                              date.setMinutes(parseInt(value));
                              field.onChange(date);
                            }}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue placeholder="Min" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 60 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {i.toString().padStart(2, '0')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={scheduleForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Take after breakfast" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {selectedMedication?.type === "injection" && (
                <FormField
                  control={scheduleForm.control}
                  name="injectionSite"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Injection Site</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value)} defaultValue={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select injection site" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {injectionSites.map(site => (
                            <SelectItem key={site} value={site}>
                              {site.charAt(0).toUpperCase() + site.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <DialogFooter>
                <Button type="submit">Add Schedule</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Medication card component
interface MedicationCardProps {
  medication: Medication;
  onEdit: () => void;
  onAddSchedule: () => void;
  schedules: MedicationSchedule[];
  onMarkTaken: (scheduleId: number, isTaken: boolean) => void;
}

function MedicationCard({ medication, onEdit, onAddSchedule, schedules, onMarkTaken }: MedicationCardProps) {
  const todaySchedules = schedules.filter(schedule => {
    const scheduleDate = new Date(schedule.scheduledTime);
    const today = new Date();
    return (
      scheduleDate.getDate() === today.getDate() &&
      scheduleDate.getMonth() === today.getMonth() &&
      scheduleDate.getFullYear() === today.getFullYear()
    );
  });

  return (
    <Card className={medication.isActive === false ? "opacity-70" : ""}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">{medication.name}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {medication.type.charAt(0).toUpperCase() + medication.type.slice(1)}
          </Badge>
          {medication.isActive === false && (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Dosage:</span>
            <span className="font-medium">{medication.dosage}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Frequency:</span>
            <span className="font-medium">{medication.frequency}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Start Date:</span>
            <span className="font-medium">{format(new Date(medication.startDate), "MMM d, yyyy")}</span>
          </div>
          {medication.endDate && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">End Date:</span>
              <span className="font-medium">{format(new Date(medication.endDate), "MMM d, yyyy")}</span>
            </div>
          )}
          {medication.notes && (
            <div className="text-sm mt-2">
              <span className="text-muted-foreground">Notes:</span>
              <p>{medication.notes}</p>
            </div>
          )}
        </div>

        {todaySchedules.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold mb-2">Today's Schedule</h4>
            <div className="space-y-2">
              {todaySchedules.map(schedule => (
                <div 
                  key={schedule.id} 
                  className={`flex items-center justify-between p-2 rounded-md text-sm
                    ${schedule.isTaken ? "bg-primary/10" : "bg-secondary/20"}`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(schedule.scheduledTime), "h:mm a")}</span>
                    {schedule.injectionSite && (
                      <Badge variant="outline" className="ml-1">
                        {schedule.injectionSite.charAt(0).toUpperCase() + schedule.injectionSite.slice(1)}
                      </Badge>
                    )}
                  </div>
                  <Button 
                    variant={schedule.isTaken ? "ghost" : "outline"}
                    size="sm"
                    onClick={() => onMarkTaken(schedule.id, !schedule.isTaken)}
                    className={schedule.isTaken ? "text-primary" : ""}
                  >
                    {schedule.isTaken ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Taken
                      </>
                    ) : "Mark Taken"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2">
        <Button variant="outline" size="sm" className="w-full" onClick={onAddSchedule}>
          <Plus className="h-4 w-4 mr-1" /> 
          Add Schedule
        </Button>
      </CardFooter>
    </Card>
  );
}

// Schedule item component for the schedule tab
interface ScheduleItemProps {
  schedule: MedicationSchedule;
  medication?: Medication;
  onMarkTaken: (isTaken: boolean) => void;
}

function ScheduleItem({ schedule, medication, onMarkTaken }: ScheduleItemProps) {
  if (!medication) return null;

  return (
    <Card className={`${schedule.isTaken ? "bg-primary/10" : ""}`}>
      <CardContent className="p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold">{medication.name}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{medication.dosage}</span>
              <span>•</span>
              <span>{format(new Date(schedule.scheduledTime), "h:mm a")}</span>
              {schedule.injectionSite && (
                <>
                  <span>•</span>
                  <Badge variant="outline">
                    {schedule.injectionSite.charAt(0).toUpperCase() + schedule.injectionSite.slice(1)}
                  </Badge>
                </>
              )}
            </div>
            {schedule.notes && (
              <p className="text-sm mt-1">{schedule.notes}</p>
            )}
          </div>
          <Button 
            variant={schedule.isTaken ? "ghost" : "outline"}
            onClick={() => onMarkTaken(!schedule.isTaken)}
            className={schedule.isTaken ? "text-primary" : ""}
          >
            {schedule.isTaken ? (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                Taken
              </>
            ) : "Mark Taken"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}